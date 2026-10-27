// media in the database: photos / covers as BinData inside the document, Canvas videos in GridFS
import express from "express";
import mongoose from "mongoose";
import { tables, gridfs } from "../models.js";
import { db, needUser, editable } from "../lib.js";

const api = express.Router();
export default api;

// the file is the raw request body (no multer); its Content-Type says what it is. 4 MB cap: Vercel rejects bodies over 4.5 MB
const MAX_UPLOAD = 4 * 1024 * 1024;
const mime = (req) => String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
const upload = (types) => (req, res, next) => {
  if (!types.test(mime(req))) return res.status(415).json({ error: `Unsupported file type "${mime(req) || "none"}", expected ${types.source}` });
  express.raw({ type: () => true, limit: MAX_UPLOAD })(req, res, (e) =>
    e?.type === "entity.too.large" ? res.status(413).json({ error: "File too large: the limit is 4 MB" })
      : e ? next(e) : req.body?.length ? next() : res.status(400).json({ error: "Empty file" }));
};
// URLs carry ?v=, so a new upload gets a new URL and the old bytes can be cached forever
const sendBinary = (res, data, type) => res.set({ "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" }).send(data);

// BinData: the bytes live in the User / Playlist document itself (select: false keeps them out of every other query)
api.put("/me/photo", needUser, upload(/^image\//), async (req, res) => {
  await tables.User.updateOne({ _id: req.user }, { photo: req.body, photo_type: mime(req), photo_at: new Date() }, { runValidators: true });
  res.json({ ok: true });
});
api.get("/users/:id/photo", async (req, res) => {
  const u = await tables.User.findById(+req.params.id, "+photo photo_type");
  u?.photo ? sendBinary(res, u.photo, u.photo_type) : res.status(404).json({ error: "No photo" });
});
api.put("/playlists/:id/cover", needUser, editable, upload(/^image\//), async (req, res) => {
  const image = `/api/playlists/${req.playlist._id}/cover?v=${Date.now()}`; // Playlist_Summary.cover = image, so every page shows it
  await req.playlist.set({ cover: req.body, cover_type: mime(req), image }).save();
  res.json({ image });
});
api.get("/playlists/:id/cover", async (req, res) => {
  const p = await tables.Playlist.findById(+req.params.id, "+cover cover_type");
  p?.cover ? sendBinary(res, p.cover, p.cover_type) : res.status(404).json({ error: "No cover" });
});

// GridFS: the video is split into 255 KB fs.chunks docs + one fs.files doc; Songs.canvas_id points at fs.files._id.
// GridFS upload streams take no session (mongodb/lib/gridfs/upload.js), so the file cannot join a transaction. Instead:
// 1) write the file  2) link it to the song in a transaction  3) if linking fails delete the orphan file, else delete the replaced one
api.put("/songs/:id/canvas", needUser, upload(/^video\/(mp4|webm)$/), async (req, res) => {
  const song_id = +req.params.id;
  if (!(await tables.Songs.exists({ _id: song_id }))) return res.status(404).json({ error: "Not found" });
  const up = gridfs().openUploadStream(`canvas-${song_id}.${mime(req).split("/")[1]}`, { metadata: { contentType: mime(req), song_id } });
  await new Promise((ok, ko) => up.once("finish", ok).once("error", ko).end(req.body));
  let old;
  try {
    await mongoose.connection.transaction(async (session) => {
      const s = await tables.Songs.findById(song_id).session(session);
      if (!s) throw new Error("Not found");
      old = s.canvas_id;
      await s.set({ canvas_id: up.id }).save({ session });
    });
  } catch (e) {
    await gridfs().delete(up.id); // compensating action: nothing links to it
    throw e;
  }
  if (old) await gridfs().delete(old).catch(() => {});
  res.status(201).json({ canvas_id: up.id });
});
// streams straight from fs.chunks; honours Range (browsers seek/loop <video> with it): 206 + Content-Range
api.get("/canvas/:file", async (req, res) => {
  const f = mongoose.isObjectIdOrHexString(req.params.file) && (await db().collection("fs.files").findOne({ _id: new mongoose.Types.ObjectId(req.params.file) }));
  if (!f) return res.status(404).json({ error: "Not found" });
  const size = f.length;
  const [, a, b] = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "") ?? []; // ponytail: multi-range requests get the whole file
  const ranged = !!(a || b);
  const start = a ? +a : b ? Math.max(0, size - +b) : 0; // "bytes=-500" = last 500 bytes
  const end = a && b ? Math.min(+b, size - 1) : size - 1;
  if (ranged && start > end) return res.status(416).set("Content-Range", `bytes */${size}`).end();
  res.status(ranged ? 206 : 200).set({
    "Content-Type": f.metadata?.contentType ?? "application/octet-stream", "Accept-Ranges": "bytes", "Content-Length": end - start + 1,
    "Cache-Control": "public, max-age=31536000, immutable", ...(ranged && { "Content-Range": `bytes ${start}-${end}/${size}` }),
  });
  gridfs().openDownloadStream(f._id, { start, end: end + 1 }).on("error", (e) => res.destroy(e)).pipe(res); // driver's end is exclusive, HTTP's inclusive
});
