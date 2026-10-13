// Backfill media: artist pictures (Deezer, no key) + YouTube ids and view counts for every song (needs YOUTUBE_API_KEY).
// Resumable: skips anything already fetched, and stops cleanly when the daily YouTube quota runs out.
import mongoose from "mongoose";
import { findVideo, viewCounts } from "./youtube.js";

await mongoose.connect(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/spotify_miniproject");
const db = mongoose.connection.db;
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

for (const a of await db.collection("Artist").find({ image: { $exists: false } }).toArray()) {
  const { data = [] } = await (await fetch(`https://api.deezer.com/search/artist?limit=5&q=${encodeURIComponent(a.artist_name)}`)).json();
  const hit = data.find((d) => norm(d.name) === norm(a.artist_name)) ?? data[0]; // ponytail: exact match else top hit, eyeball the odd ones
  console.log("artist", a.artist_name, "->", hit?.name ?? "NOT FOUND");
  if (hit) await db.collection("Artist").updateOne({ _id: a._id }, { $set: { image: hit.picture_xl } });
  await new Promise((r) => setTimeout(r, 150)); // Deezer allows ~50 req / 5s
}

const name = Object.fromEntries((await db.collection("Artist").find().toArray()).map((a) => [a._id, a.artist_name]));
try {
  for (const s of await db.collection("Songs").find({ youtube_id: { $exists: false } }).toArray()) {
    const id = await findVideo(`${s.song_name} ${name[s.artist_id] ?? ""} audio`);
    console.log("song", s.song_name, "->", id ?? "NOT FOUND");
    if (id) await db.collection("Songs").updateOne({ _id: s._id }, { $set: { youtube_id: id } });
  }
} catch (e) {
  console.log(e.message, "- rerun tomorrow, progress is saved");
}

const todo = await db.collection("Songs").find({ youtube_id: { $exists: true }, yt_views: { $exists: false } }).toArray();
for (let i = 0; i < todo.length; i += 50) {
  const batch = todo.slice(i, i + 50);
  const views = await viewCounts(batch.map((s) => s.youtube_id));
  for (const s of batch) if (s.youtube_id in views) await db.collection("Songs").updateOne({ _id: s._id }, { $set: { yt_views: views[s.youtube_id] } });
}
console.log("done, view counts for", todo.length, "songs");
process.exit();
