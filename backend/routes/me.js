// the logged-in user's likes, follows and play history (through the models, so the triggers fire)
import express from "express";
import { tables } from "../models.js";
import { db, tx, needUser, songsById, insertOnce } from "../lib.js";

const api = express.Router();
export default api;


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

// the sidebar library in one request: own + shared playlists, followed playlists and artists
api.get("/me/library", needUser, async (req, res) => {
  const [follows, shared] = await Promise.all([tables.Follows.find({ user_id: req.user }), tables.Collaborators.find({ user_id: req.user })]);
  const followed = (kind) => follows.filter((f) => f.kind === kind).map((f) => f.target_id);
  const sharedIds = shared.map((c) => c.playlist_id);
  const [playlists, followedPlaylists, followedArtists] = await Promise.all([
    db().collection("Playlist_Summary").find({ $or: [{ user_id: req.user }, { playlist_id: { $in: sharedIds } }] }).toArray(),
    db().collection("Playlist_Summary").find({ playlist_id: { $in: followed("playlist"), $nin: sharedIds }, is_public: true, user_id: { $ne: req.user } }).toArray(),
    db().collection("Artist_Summary").find({ artist_id: { $in: followed("artist") } }).toArray(),
  ]);
  res.json({ playlists: playlists.map((p) => ({ ...p, shared: p.user_id !== req.user })), followedPlaylists, followedArtists });
});

// "Wrapped"-style numbers from the user's own Listens. ?days=30 (1..3650), ?tz=Asia/Kolkata so days and hours are local
api.get("/me/stats", needUser, async (req, res) => {
  const days = Math.min(Math.max(Math.round(+req.query.days) || 30, 1), 3650);
  let timezone = String(req.query.tz ?? "UTC");
  try { new Intl.DateTimeFormat("en-CA", { timeZone: timezone }); } catch { timezone = "UTC"; } // not a real IANA zone
  const [r] = await tables.Listens.aggregate([
    { $match: { user_id: req.user, played_at: { $gte: new Date(Date.now() - days * 864e5) } } },
    { $lookup: { from: "Songs", localField: "song_id", foreignField: "_id", as: "s" } },
    { $unwind: "$s" },
    { $facet: {
      totals: [{ $group: { _id: null, plays: { $sum: 1 }, seconds: { $sum: "$s.duration" }, songs: { $addToSet: "$song_id" }, artists: { $addToSet: "$s.artist_id" } } },
        { $project: { _id: 0, plays: 1, seconds: 1, songs: { $size: "$songs" }, artists: { $size: "$artists" } } }],
      songs: [{ $group: { _id: "$song_id", plays: { $sum: 1 } } }, { $sort: { plays: -1, _id: 1 } }, { $limit: 10 }],
      artists: [{ $group: { _id: "$s.artist_id", plays: { $sum: 1 }, seconds: { $sum: "$s.duration" } } }, { $sort: { plays: -1, _id: 1 } }, { $limit: 10 }],
      genres: [{ $match: { "s.genre_id": { $ne: null } } }, { $group: { _id: "$s.genre_id", plays: { $sum: 1 } } }, { $sort: { plays: -1, _id: 1 } }, { $limit: 8 }],
      by_day: [{ $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$played_at", timezone } }, plays: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      by_hour: [{ $group: { _id: { $hour: { date: "$played_at", timezone } }, plays: { $sum: 1 } } }, { $sort: { _id: 1 } }],
    } },
  ]);
  const [songs, artists, genres] = await Promise.all([
    songsById(r.songs.map((s) => s._id)),
    tables.Artist.find({ _id: { $in: r.artists.map((a) => a._id) } }, "artist_name image"),
    tables.Genre.find({ _id: { $in: r.genres.map((g) => g._id) } }),
  ]);
  const name = (rows, id) => rows.find((x) => x._id === id);
  res.json({
    days,
    totals: r.totals[0] ?? { plays: 0, seconds: 0, songs: 0, artists: 0 },
    songs: songs.map((s) => ({ ...s, my_plays: r.songs.find((x) => x._id === s.song_id).plays })),
    artists: r.artists.map((a) => ({ artist_id: a._id, artist_name: name(artists, a._id)?.artist_name, image: name(artists, a._id)?.image, plays: a.plays, seconds: a.seconds })),
    genres: r.genres.map((g) => ({ genre_id: g._id, genre_name: name(genres, g._id)?.genre_name, plays: g.plays })),
    // every day of the last min(days, 90), quiet ones as 0, so a chart's x-axis is real time
    by_day: Array.from({ length: Math.min(days, 90) }, (_, i) => {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(Date.now() - (Math.min(days, 90) - 1 - i) * 864e5); // YYYY-MM-DD
      return { day, plays: r.by_day.find((d) => d._id === day)?.plays ?? 0 };
    }),
    by_hour: Array.from({ length: 24 }, (_, h) => r.by_hour.find((x) => x._id === h)?.plays ?? 0),
  });
});

// follow feed: what the people and playlists you follow did lately, newest first, plus the latest albums of artists you follow.
// Events: a followed user liked a song / followed something, a song was added to a followed playlist (or a public one a followed user owns).
api.get("/me/feed", needUser, async (req, res) => {
  const follows = await tables.Follows.find({ user_id: req.user });
  const ids = (kind) => follows.filter((f) => f.kind === kind).map((f) => f.target_id);
  const users = ids("user");
  const theirs = (await tables.Playlist.find({ user_id: { $in: users }, is_public: true }, "_id")).map((p) => p._id);
  const N = 40;
  const [likes, followsOf, adds, releases] = await Promise.all([
    tables.Liked_Songs.find({ user_id: { $in: users } }).sort({ liked_at: -1 }).limit(N),
    tables.Follows.find({ user_id: { $in: users } }).sort({ followed_at: -1 }).limit(N),
    tables.Contains.find({ playlist_id: { $in: [...ids("playlist"), ...theirs] }, added_at: { $ne: null } }).sort({ added_at: -1 }).limit(N),
    db().collection("Album_Details").find({ artist_id: { $in: ids("artist") } }).sort({ release_year: -1, album_id: -1 }).limit(12).toArray(),
  ]);
  const byKind = (k) => followsOf.filter((f) => f.kind === k).map((f) => f.target_id);
  const [songs, people, playlists, artists] = await Promise.all([
    songsById([...new Set([...likes, ...adds].map((x) => x.song_id))]),
    db().collection("User_Public").find({ user_id: { $in: [...users, ...byKind("user")] } }).project({ user_id: 1, user_name: 1, photo: 1 }).toArray(),
    tables.Playlist.find({ _id: { $in: [...adds.map((a) => a.playlist_id), ...byKind("playlist")] } }, "playlist_name is_public"),
    tables.Artist.find({ _id: { $in: byKind("artist") } }, "artist_name"),
  ]);
  const song = (id) => songs.find((s) => s.song_id === id);
  const user = (id) => people.find((u) => u.user_id === id);
  const playlist = (id) => playlists.find((p) => p._id === id);
  const target = { user: (id) => user(id)?.user_name, artist: (id) => artists.find((a) => a._id === id)?.artist_name, playlist: (id) => playlist(id)?.is_public && playlist(id).playlist_name };
  const events = [
    ...likes.map((l) => ({ type: "like", at: l.liked_at, user: user(l.user_id), song: song(l.song_id) })),
    ...followsOf.map((f) => ({ type: "follow", at: f.followed_at, user: user(f.user_id), kind: f.kind, target_id: f.target_id, target_name: target[f.kind](f.target_id) })),
    ...adds.map((a) => ({ type: "add", at: a.added_at, playlist: { playlist_id: a.playlist_id, playlist_name: playlist(a.playlist_id)?.playlist_name }, song: song(a.song_id) })),
  ].filter((e) => e.song !== undefined || e.target_name) // a deleted song or a private playlist drops out
    .sort((a, b) => b.at - a.at).slice(0, 50);
  res.json({ now: new Date(), following: { users: users.length, artists: ids("artist").length, playlists: ids("playlist").length }, events, releases });
});
