import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { tables, triggers } from "./models.js";
import { views, createViews } from "./views.js";
import { stats } from "./stats.js";
import { findVideo, viewCounts } from "./youtube.js";
import { hashPassword, checkPassword, makeToken, readToken, cookieOptions } from "./auth.js";

const PORT = process.env.PORT ?? 5050;
mongoose.set("transactionAsyncLocalStorage", true); // every query inside connection.transaction(fn), triggers included, joins its session
await mongoose.connect(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/spotify_miniproject");
await createViews(mongoose.connection.db);

const app = express();
app.use(cors(), express.json());
const api = express.Router();
app.use("/api", api);

const db = () => mongoose.connection.db;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// ?user_id=1&is_public=true -> { user_id: 1, is_public: true }
const where = (q) =>
  Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v === "true" ? true : v === "false" ? false : v !== "" && !isNaN(v) ? Number(v) : v]));

// START TRANSACTION ... COMMIT around a write route: the handler and every trigger it fires commit or roll back together.
// Snapshot reads + majority writes. A write conflict (TransientTransactionError) re-runs the handler; any other error is a ROLLBACK
// and reaches the error handler. res.json is held back until COMMIT, so nobody sees a response for a rolled-back write.
const TX = { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } };
const tx = (handler) => {
  const run = async (req, res, next) => {
    let body;
    res.json = (b) => ((body = b), res);
    try {
      await mongoose.connection.transaction(() => ((res.statusCode = 200), handler(req, res, next)), TX);
    } catch (e) {
      res.removeHeader("Set-Cookie"); // no session cookie for a rolled-back signup
      throw e;
    } finally {
      delete res.json; // back to express's res.json
    }
    res.json(body);
  };
  run.tx = true; // listed in /meta
  return run;
};

api.get("/meta", (req, res) =>
  res.json({
    tables: Object.keys(tables), views: Object.entries(views).map(([name, v]) => ({ name, ...v })), triggers,
    transactions: { ...TX, routes: api.stack.filter((l) => l.route?.stack.some((s) => s.handle.tx)).map((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} /api${l.route.path}`) },
  }),
);

// ---------- VIEWS (read-only) ----------
api.get("/views/:name", async (req, res) => {
  if (!views[req.params.name]) return res.status(404).json({ error: "No such view" });
  res.json(await db().collection(req.params.name).find(where(req.query)).toArray());
});

api.get("/search", async (req, res) => {
  const q = { $regex: esc(String(req.query.q ?? "")), $options: "i" };
  const SORTS = { plays: { plays: -1 }, name: { song_name: 1 }, duration: { duration: -1 }, year: { release_year: -1 } };
  const genre = req.query.genre ? { genre_id: +req.query.genre } : {};
  const [songs, artists, albums, playlists] = await Promise.all([
    db().collection("Song_Details").find({ $or: [{ song_name: q }, { artist_name: q }, { album_name: q }], ...genre }).sort(SORTS[req.query.sort] ?? { song_id: 1 }).limit(100).toArray(),
    db().collection("Artist_Summary").find({ artist_name: q }).limit(12).toArray(),
    db().collection("Album_Details").find({ $or: [{ album_name: q }, { artist_name: q }] }).limit(12).toArray(),
    db().collection("Playlist_Summary").find({ playlist_name: q, is_public: true }).limit(12).toArray(),
  ]);
  res.json({ songs, artists, albums, playlists });
});

// ---------- STATS (public: only public playlists are counted) ----------
api.get("/stats", async (req, res) => res.json(await stats(db())));

// ---------- PLAY: song -> YouTube video id, looked up once then cached in Songs.youtube_id ----------
api.get("/play/:id", async (req, res) => {
  const song = await tables.Songs.findById(req.params.id);
  if (!song) return res.status(404).json({ error: "Not found" });
  if (!song.youtube_id) {
    if (!process.env.YOUTUBE_API_KEY) return res.status(500).json({ error: "Set YOUTUBE_API_KEY in backend/.env" });
    try {
      const artist = await tables.Artist.findById(song.artist_id);
      const id = await findVideo(`${song.song_name} ${artist?.artist_name ?? ""} audio`);
      if (!id) return res.status(404).json({ error: "No YouTube match" });
      const views = (await viewCounts([id]))[id];
      await song.set({ youtube_id: id, yt_views: views }).save();
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  }
  res.json({ youtube_id: song.youtube_id });
});

// ---------- SESSION: cookie "spoot" is set by login/signup; req.user = user_id or null ----------
const cookieOf = (req, name) => req.headers.cookie?.split("; ").find((c) => c.startsWith(name + "="))?.slice(name.length + 1);
api.use((req, res, next) => {
  req.user = readToken(cookieOf(req, "spoot"));
  next();
});
const needUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: "Log in first" }));
const session = (res, id) => res.cookie("spoot", makeToken(id), cookieOptions);

api.post("/auth/signup", tx(async (req, res) => {
  const { user_name, email, phone, password } = req.body;
  if (!password || password.length < 6) throw new Error("Password must be at least 6 characters");
  const u = await tables.User.create({ user_name, email, phone: Number(phone), password_hash: hashPassword(password) });
  session(res, u._id);
  res.status(201).json({ user_id: u._id, user_name: u.user_name });
}));
api.post("/auth/login", async (req, res) => {
  const u = await tables.User.findOne({ email: String(req.body.email ?? "").toLowerCase() });
  if (!u || !checkPassword(String(req.body.password ?? ""), u.password_hash)) return res.status(401).json({ error: "Wrong email or password" });
  session(res, u._id);
  res.json({ user_id: u._id, user_name: u.user_name });
});
api.post("/auth/logout", (req, res) => res.clearCookie("spoot", { path: "/" }).json({ ok: true }));
api.get("/me", async (req, res) => {
  const u = req.user && (await tables.User.findById(req.user, "user_name email"));
  res.json(u ? { user_id: u._id, user_name: u.user_name, email: u.email } : null);
});

// ---------- LIKES / FOLLOWS / HISTORY (through the models, so the triggers fire) ----------
const songsById = async (ids) => {
  const rows = await db().collection("Song_Details").find({ song_id: { $in: ids } }).toArray();
  const by = new Map(rows.map((r) => [r.song_id, r]));
  return ids.map((i) => by.get(i)).filter(Boolean);
};
// INSERT IGNORE: already there = fine. Checked first, because a duplicate key error inside a transaction aborts it.
const insertOnce = async (Model, row) => (await Model.exists(row)) || Model.create(row);

api.get("/me/likes", needUser, async (req, res) => res.json((await tables.Liked_Songs.find({ user_id: req.user }).sort({ liked_at: -1 })).map((l) => l.song_id)));
api.get("/me/liked", needUser, async (req, res) =>
  res.json(await songsById((await tables.Liked_Songs.find({ user_id: req.user }).sort({ liked_at: -1 })).map((l) => l.song_id))),
);
api.put("/like/:song", needUser, tx(async (req, res) => {
  await insertOnce(tables.Liked_Songs, { user_id: req.user, song_id: +req.params.song });
  res.json({ liked: true });
}));
api.delete("/like/:song", needUser, tx(async (req, res) => {
  await tables.Liked_Songs.deleteOne({ user_id: req.user, song_id: +req.params.song });
  res.json({ liked: false });
}));

api.get("/me/follows", needUser, async (req, res) => res.json(await tables.Follows.find({ user_id: req.user }, "kind target_id -_id").sort({ followed_at: -1 })));
api.put("/follow/:kind/:id", needUser, tx(async (req, res) => {
  await insertOnce(tables.Follows, { user_id: req.user, kind: req.params.kind, target_id: +req.params.id });
  res.json({ following: true });
}));
api.delete("/follow/:kind/:id", needUser, tx(async (req, res) => {
  await tables.Follows.deleteOne({ user_id: req.user, kind: req.params.kind, target_id: +req.params.id });
  res.json({ following: false });
}));

// a stream: the after_listen_insert trigger bumps Songs.plays. Logged-out listeners count too (user_id stays empty).
api.post("/listen/:song", tx(async (req, res) => {
  await tables.Listens.create({ user_id: req.user ?? undefined, song_id: +req.params.song });
  res.status(201).json({ ok: true });
}));
api.get("/me/recent", needUser, async (req, res) => {
  const last = await tables.Listens.aggregate([
    { $match: { user_id: req.user } },
    { $group: { _id: "$song_id", at: { $max: "$played_at" } } },
    { $sort: { at: -1 } },
    { $limit: Math.min(+req.query.limit || 20, 100) },
  ]);
  res.json(await songsById(last.map((l) => l._id)));
});

// ---------- PLAYLIST EDITING: the owner and collaborators may change songs, only the owner manages collaborators ----------
const editable = async (req, res, next) => {
  const p = await tables.Playlist.findById(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  const ok = p.user_id === req.user || (await tables.Collaborators.exists({ playlist_id: p._id, user_id: req.user }));
  if (!ok) return res.status(403).json({ error: "Not your playlist" });
  req.playlist = p;
  next();
};
api.get("/me/playlists", needUser, async (req, res) => {
  const shared = (await tables.Collaborators.find({ user_id: req.user })).map((c) => c.playlist_id);
  const rows = await tables.Playlist.find({ $or: [{ user_id: req.user }, { _id: { $in: shared } }] }).sort({ _id: 1 });
  res.json(rows.map((p) => ({ ...p.toObject(), shared: p.user_id !== req.user })));
});
api.post("/playlists/:id/songs", needUser, editable, tx(async (req, res) => res.status(201).json(await tables.Contains.create({ playlist_id: req.playlist._id, song_id: +req.body.song_id }))));
api.delete("/playlists/:id/songs/:song", needUser, editable, tx(async (req, res) => {
  const row = await tables.Contains.findOneAndDelete({ playlist_id: req.playlist._id, song_id: +req.params.song }); // after_contains_delete logs it
  row ? res.json(row) : res.status(404).json({ error: "Not in this playlist" });
}));
api.put("/playlists/:id/order", needUser, editable, tx(async (req, res) => {
  await tables.Contains.bulkWrite(req.body.song_ids.map((song_id, position) => ({ updateOne: { filter: { playlist_id: req.playlist._id, song_id }, update: { $set: { position } } } })));
  res.json({ ok: true });
}));
api.get("/playlists/:id/collaborators", async (req, res) => {
  const rows = await tables.Collaborators.find({ playlist_id: +req.params.id });
  res.json(await db().collection("User_Public").find({ user_id: { $in: rows.map((r) => r.user_id) } }).project({ _id: 0, user_id: 1, user_name: 1 }).toArray());
});
api.post("/playlists/:id/collaborators", needUser, tx(async (req, res) => {
  const p = await tables.Playlist.findById(req.params.id);
  if (!p || p.user_id !== req.user) return res.status(403).json({ error: "Only the owner can add collaborators" });
  const u = await tables.User.findOne({ user_name: String(req.body.user_name ?? "").trim() });
  if (!u) return res.status(404).json({ error: `No user named ${req.body.user_name}` });
  await insertOnce(tables.Collaborators, { playlist_id: p._id, user_id: u._id });
  res.status(201).json({ user_id: u._id, user_name: u.user_name });
}));
api.delete("/playlists/:id/collaborators/:uid", needUser, tx(async (req, res) => {
  const p = await tables.Playlist.findById(req.params.id);
  if (!p || (p.user_id !== req.user && +req.params.uid !== req.user)) return res.status(403).json({ error: "Not allowed" }); // owner removes anyone, a collaborator can leave
  await tables.Collaborators.deleteOne({ playlist_id: p._id, user_id: +req.params.uid });
  res.json({ ok: true });
}));

// artist page numbers: listeners = distinct logged-in users who played them in the last 30 days
api.get("/artists/:id/stats", async (req, res) => {
  const artist_id = +req.params.id;
  const song_id = { $in: (await tables.Songs.find({ artist_id }, "_id")).map((s) => s._id) };
  const [listeners] = await tables.Listens.aggregate([
    { $match: { song_id, user_id: { $ne: null }, played_at: { $gte: new Date(Date.now() - 30 * 864e5) } } },
    { $group: { _id: "$user_id" } },
    { $count: "n" },
  ]);
  res.json({ monthly_listeners: listeners?.n ?? 0, followers: await tables.Follows.countDocuments({ kind: "artist", target_id: artist_id }) });
});

// ---------- LYRICS: fetched live from LRCLIB (free, no key), kept in memory only — nothing is stored in the DB ----------
const lyricsCache = new Map();
api.get("/lyrics/:id", async (req, res) => {
  const song = await tables.Songs.findById(req.params.id);
  if (!song) return res.status(404).json({ error: "Not found" });
  if (!lyricsCache.has(song._id)) {
    const artist = await tables.Artist.findById(song.artist_id);
    const url = `https://lrclib.net/api/search?${new URLSearchParams({ track_name: song.song_name, artist_name: artist?.artist_name ?? "" })}`;
    const hits = await (await fetch(url, { headers: { "User-Agent": "SpooftifyMiniProject/1.0" } })).json().catch(() => []);
    const withText = hits.filter((h) => h.plainLyrics);
    const best = (withText.length ? withText : hits.filter((h) => h.instrumental)).sort((a, b) => Math.abs(a.duration - song.duration) - Math.abs(b.duration - song.duration))[0];
    lyricsCache.set(song._id, best ? { plain: best.plainLyrics, synced: best.syncedLyrics, instrumental: best.instrumental } : { plain: null });
  }
  res.json(lyricsCache.get(song._id));
});

// ---------- GENERIC CRUD on tables ----------
// update = load + set + save and delete = findOneAndDelete, so the triggers fire
api.param("table", (req, res, next, t) => {
  req.Model = tables[t];
  req.Model ? next() : res.status(404).json({ error: `No such table: ${t}` });
});
api.get("/:table", async (req, res) => res.json(await req.Model.find(where(req.query)).sort({ _id: 1 })));
api.get("/:table/:id", async (req, res) => {
  const doc = await req.Model.findById(req.params.id);
  doc ? res.json(doc) : res.status(404).json({ error: "Not found" });
});
api.post("/:table", tx(async (req, res) => res.status(201).json(await req.Model.create(req.body))));
api.put("/:table/:id", tx(async (req, res) => {
  const doc = await req.Model.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: "Not found" });
  const { _id, ...changes } = req.body;
  res.json(await doc.set(changes).save());
}));
api.delete("/:table/:id", tx(async (req, res) => {
  const doc = await req.Model.findOneAndDelete({ _id: req.params.id });
  doc ? res.json(doc) : res.status(404).json({ error: "Not found" });
}));

app.use((err, req, res, next) => {
  const msg = err.code === 11000 ? `Duplicate key: ${JSON.stringify(err.keyValue)}` : err.message;
  res.status(400).json({ error: msg });
});

// Vercel imports the app; locally we listen
if (!process.env.VERCEL) app.listen(PORT, () => console.log(`API on http://localhost:${PORT}/api`));
export default app;
