// read-only catalog: views, search, stats, playback lookup, lyrics, artist numbers
import express from "express";
import { tables } from "../models.js";
import { views } from "../views.js";
import { stats } from "../stats.js";
import { findVideo, viewCounts } from "../youtube.js";
import { db, esc, where, songsById } from "../lib.js";

const api = express.Router();
export default api;

// ---------- VIEWS (read-only) ----------
api.get("/views/:name", async (req, res) => {
  if (!views[req.params.name]) return res.status(404).json({ error: "No such view" });
  const { _sort, _limit, ...q } = req.query; // ?_sort=plays&_limit=20: top N by a column, so the home page needn't fetch every row
  let cur = db().collection(req.params.name).find(where(q));
  if (_sort) cur = cur.sort({ [_sort]: -1 });
  if (_limit) cur = cur.limit(Math.min(+_limit || 0, 500));
  res.json(await cur.toArray());
});

api.get("/search", async (req, res) => {
  const q = { $regex: esc(String(req.query.q ?? "")), $options: "i" };
  const SORTS = { plays: { plays: -1 }, name: { song_name: 1 }, duration: { duration: -1 }, year: { release_year: -1 } };
  const genre = req.query.genre ? { genre_id: +req.query.genre } : {};
  const n = Math.min(Math.max(+req.query.limit || 0, 0), 500); // ?limit=N raises every cap (the page's "Show more"); default 100 songs, 12 of the rest
  const [songs, artists, albums, playlists] = await Promise.all([
    db().collection("Song_Details").find({ $or: [{ song_name: q }, { artist_name: q }, { album_name: q }], ...genre }).sort(SORTS[req.query.sort] ?? { song_id: 1 }).limit(n || 100).toArray(),
    db().collection("Artist_Summary").find({ artist_name: q }).limit(n || 12).toArray(),
    db().collection("Album_Details").find({ $or: [{ album_name: q }, { artist_name: q }] }).limit(n || 12).toArray(),
    db().collection("Playlist_Summary").find({ playlist_name: q, is_public: true }).limit(n || 12).toArray(),
  ]);
  res.json({ songs, artists, albums, playlists });
});

// ---------- STATS (public: only public playlists are counted) ----------
// ponytail: 30 s in-memory cache (per instance); upgrade to Runtime Cache / $merge if stale numbers matter
let statsCache = { at: 0, body: null };
api.get("/stats", async (req, res) => {
  if (Date.now() - statsCache.at > 30_000) statsCache = { at: Date.now(), body: await stats(db()) };
  res.json(statsCache.body);
});

// ---------- PLAY: song -> YouTube video id, looked up once then cached in Songs.youtube_id ----------
// two people pressing play on the same uncached song share one search (100 quota units), not one each
const lookups = new Map(); // song_id -> Promise<youtube_id | null>
const lookup = (song) => {
  if (!lookups.has(song._id))
    lookups.set(song._id, (async () => {
      const artist = await tables.Artist.findById(song.artist_id);
      const id = await findVideo(`${song.song_name} ${artist?.artist_name ?? ""} audio`);
      if (id) await song.set({ youtube_id: id, yt_views: (await viewCounts([id]))[id] }).save();
      return id ?? null;
    })().finally(() => lookups.delete(song._id)));
  return lookups.get(song._id);
};
api.get("/play/:id", async (req, res) => {
  const song = await tables.Songs.findById(req.params.id);
  if (!song) return res.status(404).json({ error: "Not found" });
  if (song.youtube_id) return res.json({ youtube_id: song.youtube_id });
  if (!process.env.YOUTUBE_API_KEY) return res.status(503).json({ error: "Set YOUTUBE_API_KEY in backend/.env" });
  try {
    const id = await lookup(song);
    id ? res.json({ youtube_id: id }) : res.status(404).json({ error: "No YouTube match" });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ?ids=1,2,3 in that order
api.get("/songs-by-id", async (req, res) => res.json(await songsById(String(req.query.ids ?? "").split(",").filter(Boolean).map(Number)))); // ?ids=1,2,3

// song radio: what to play once the queue runs out. Same genre (same artist when it has none), tempo close to the seed,
// at most 2 songs per artist so it doesn't turn into one artist's discography. ?exclude=1,2,3 = already queued.
api.get("/radio/:song", async (req, res) => {
  const seed = await db().collection("Song_Details").findOne({ song_id: +req.params.song });
  if (!seed) return res.status(404).json({ error: "Not found" });
  const skip = [seed.song_id, ...String(req.query.exclude ?? "").split(",").slice(0, 500).map(Number).filter(Number.isInteger)];
  const near = seed.genre_id != null ? { genre_id: seed.genre_id } : { artist_id: seed.artist_id };
  const sample = (match) => db().collection("Song_Details").aggregate([{ $match: { song_id: { $nin: skip }, ...match } }, { $sample: { size: 60 } }]).toArray();
  let pool = await sample(near);
  if (pool.length < 5) pool = pool.concat(await sample({ song_id: { $nin: [...skip, ...pool.map((s) => s.song_id)] } })); // tiny genre: top up from everything
  const gap = (s) => (seed.bpm && s.bpm ? Math.abs(s.bpm - seed.bpm) : 60); // unknown tempo sorts after the close ones
  const perArtist = new Map();
  const picks = pool.toSorted((a, b) => gap(a) - gap(b)).filter((s) => {
    const n = perArtist.get(s.artist_id) ?? 0;
    perArtist.set(s.artist_id, n + 1);
    return n < 2;
  });
  res.json(picks.slice(0, 20));
});

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
// ponytail: Map insertion order makes it a FIFO of the last 500 songs; good enough, an LRU only if memory matters
const lyricsCache = new Map();
api.get("/lyrics/:id", async (req, res) => {
  const song = await tables.Songs.findById(req.params.id);
  if (!song) return res.status(404).json({ error: "Not found" });
  if (!lyricsCache.has(song._id)) {
    const artist = await tables.Artist.findById(song.artist_id);
    const url = `https://lrclib.net/api/search?${new URLSearchParams({ track_name: song.song_name, artist_name: artist?.artist_name ?? "" })}`;
    const r = await fetch(url, { headers: { "User-Agent": "SpooftifyMiniProject/1.0" }, signal: AbortSignal.timeout(8000) }).catch(() => null);
    const hits = r?.ok ? await r.json().catch(() => null) : null;
    if (!Array.isArray(hits)) return res.status(502).json({ error: "Lyrics service unavailable, try again later" }); // not cached: the next try may work
    const withText = hits.filter((h) => h.plainLyrics);
    const best = (withText.length ? withText : hits.filter((h) => h.instrumental)).sort((a, b) => Math.abs(a.duration - song.duration) - Math.abs(b.duration - song.duration))[0];
    lyricsCache.set(song._id, best ? { plain: best.plainLyrics, synced: best.syncedLyrics, instrumental: best.instrumental } : { plain: null });
    if (lyricsCache.size > 500) lyricsCache.delete(lyricsCache.keys().next().value);
  }
  res.json(lyricsCache.get(song._id));
});
