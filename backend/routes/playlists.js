// playlist editing: the owner and collaborators may change songs, only the owner manages collaborators
import express from "express";
import { tables } from "../models.js";
import { db, tx, needUser, editable, insertOnce } from "../lib.js";

const api = express.Router();
export default api;

// ---------- PLAYLIST EDITING: the owner and collaborators may change songs, only the owner manages collaborators ----------
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
  const ids = req.body?.song_ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || !ids.every(Number.isInteger) || new Set(ids).size !== ids.length)
    return res.status(400).json({ error: "song_ids must be a list of distinct song ids (at most 50)" });
  if ((await tables.Contains.countDocuments({ playlist_id: req.playlist._id, song_id: { $in: ids } })) !== ids.length)
    return res.status(400).json({ error: "song_ids has songs that are not in this playlist" });
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
// DROP a playlist as ONE transaction: Contains and Collaborators are ON DELETE RESTRICT, so they go first (each song is logged to Removed_Songs
// by after_contains_delete), then the follows pointing at it, then the playlist. Any failure rolls the whole thing back, nothing half deleted.
api.delete("/playlists/:id", needUser, tx(async (req, res) => {
  const p = await tables.Playlist.findById(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  if (p.user_id !== req.user) return res.status(403).json({ error: "Only the owner can delete a playlist" });
  for (const c of await tables.Contains.find({ playlist_id: p._id }, "_id")) await tables.Contains.findOneAndDelete({ _id: c._id }); // sequential: one session
  await tables.Collaborators.deleteMany({ playlist_id: p._id });
  await tables.Follows.deleteMany({ kind: "playlist", target_id: p._id });
  await tables.Playlist.findOneAndDelete({ _id: p._id });
  res.json({ ok: true });
}));
