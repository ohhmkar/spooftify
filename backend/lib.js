// shared by the route files: database handle, query helpers, the transaction wrapper and the auth / ownership guards
import mongoose from "mongoose";
import { tables } from "./models.js";

export const db = () => mongoose.connection.db;
export const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// ?user_id=1&is_public=true -> { user_id: 1, is_public: true }
export const where = (q) =>
  Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v === "true" ? true : v === "false" ? false : v !== "" && !isNaN(v) ? Number(v) : v]));

// START TRANSACTION ... COMMIT around a write route: the handler and every trigger it fires commit or roll back together.
// Snapshot reads + majority writes. A write conflict (TransientTransactionError) re-runs the handler; any other error is a ROLLBACK
// and reaches the error handler. res.json is held back until COMMIT, so nobody sees a response for a rolled-back write.
export const TX = { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } };
export const tx = (handler) => {
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

export const needUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: "Log in first" }));
export const editable = async (req, res, next) => {
  const p = await tables.Playlist.findById(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  const ok = p.user_id === req.user || (await tables.Collaborators.exists({ playlist_id: p._id, user_id: req.user }));
  if (!ok) return res.status(403).json({ error: "Not your playlist" });
  req.playlist = p;
  next();
};

export const songsById = async (ids) => {
  const rows = await db().collection("Song_Details").find({ song_id: { $in: ids } }).toArray();
  const by = new Map(rows.map((r) => [r.song_id, r]));
  return ids.map((i) => by.get(i)).filter(Boolean);
};
// INSERT IGNORE: already there = fine. Checked first, because a duplicate key error inside a transaction aborts it.
export const insertOnce = async (Model, row) => (await Model.exists(row)) || Model.create(row);
