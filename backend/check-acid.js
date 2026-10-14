// npm run check: proves the write routes are atomic and isolated, through the real Express app, on a scratch database.
// Needs a local replica set (npm run db + rs.initiate, see README). Never loads .env, so it can't touch Atlas.
import assert from "node:assert/strict";

const base = new URL(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/spotify_miniproject");
assert.match(base.hostname, /^(127\.0\.0\.1|localhost)$/, "check-acid drops its database: local MongoDB only");
base.pathname = "/spooftify_acid_check";
process.env.MONGODB_URI = base.href;
process.env.VERCEL = "1"; // server.js: export the app, don't listen
const { default: app } = await import("./server.js");
const { default: mongoose } = await import("mongoose");
const { Artist, Songs, User, Playlist, Contains, RemovedSong, Liked, Listen, Genre } = await import("./models.js");

await mongoose.connection.dropDatabase();
await Promise.all([Contains, Liked, Genre].map((m) => m.syncIndexes()));
const server = app.listen(0);
const url = `http://127.0.0.1:${server.address().port}/api`;
const call = async (method, path, body) => {
  const r = await fetch(url + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

// fixtures: 1 artist, 60 songs, 1 user, playlists 1 and 2. Song 1 is in playlist 1, liked and played 3 times.
await Artist.create({ _id: 1, artist_name: "A", country: "IN" });
for (let i = 1; i <= 60; i++) await Songs.create({ _id: i, song_name: `s${i}`, duration: 100, audio_file: "x", artist_id: 1 });
await User.create({ _id: 1, user_name: "u", email: "u@x", phone: 1, password_hash: "x" });
await Playlist.create([{ _id: 1, playlist_name: "p1", user_id: 1 }, { _id: 2, playlist_name: "p2", user_id: 1 }]);
await Contains.create({ playlist_id: 1, song_id: 1 });
await Liked.create({ user_id: 1, song_id: 1 });
for (let i = 0; i < 3; i++) await Listen.create({ user_id: 1, song_id: 1 });
const snapshot = async () => ({
  song: !!(await Songs.exists({ _id: 1 })), contains: await Contains.countDocuments({ song_id: 1 }),
  removed: await RemovedSong.countDocuments(), liked: await Liked.countDocuments({ song_id: 1 }), listens: await Listen.countDocuments({ song_id: 1 }),
});
const before = await snapshot();

// 1. ATOMICITY: DELETE /api/Songs/1 fails midway through before_song_delete (Contains row already deleted and logged, then Listens throws)
const deleteMany = Listen.deleteMany;
Listen.deleteMany = () => { throw new Error("simulated crash mid-cascade"); };
const r1 = await call("DELETE", "/Songs/1");
assert.equal(r1.status, 400);
assert.match(r1.body.error, /simulated crash/);
assert.deepEqual(await snapshot(), before, "rolled-back delete left changes behind");
console.log("atomicity: failed song delete rolled back, nothing changed", before);

// same failure without a transaction (direct model call) leaves a half-done cascade: that's what the transaction prevents
await Songs.findOneAndDelete({ _id: 1 }).catch(() => {});
const partial = await snapshot();
assert.notDeepEqual(partial, before);
console.log("  same crash without a transaction leaves:", partial);
Listen.deleteMany = deleteMany;

const r2 = await call("DELETE", "/Songs/1");
assert.equal(r2.status, 200);
assert.deepEqual(await snapshot(), { song: false, contains: 0, removed: 1, liked: 0, listens: 0 });
console.log("  without the crash the whole cascade commits");

// 2. ISOLATION: 59 concurrent inserts into playlist 2 never pass the 50-song cap, positions stay 0..49
const results = await Promise.all(Array.from({ length: 59 }, (_, i) => call("POST", "/Contains", { playlist_id: 2, song_id: i + 2 })));
const ok = results.filter((r) => r.status === 201).length;
const rows = await Contains.find({ playlist_id: 2 }).sort({ position: 1 });
assert.equal(rows.length, 50);
assert.equal(ok, 50);
assert.ok(results.filter((r) => r.status !== 201).every((r) => /is full/.test(r.body.error)));
assert.deepEqual(rows.map((r) => r.position), [...Array(50).keys()]);
console.log(`isolation: 59 concurrent Contains inserts -> ${ok} committed, ${59 - ok} "playlist is full", positions 0..49 unique`);

// 3. AUTO_INCREMENT: 20 concurrent POST /api/Genre without _id get 20 distinct ids from Counters
const genres = await Promise.all(Array.from({ length: 20 }, (_, i) => call("POST", "/Genre", { genre_name: `g${i}` })));
const ids = genres.map((g) => g.body._id);
assert.ok(genres.every((g) => g.status === 201));
assert.equal(new Set(ids).size, 20);
assert.deepEqual([...ids].sort((a, b) => a - b), [...Array(20).keys()].map((i) => i + 1));
console.log("auto-increment: 20 concurrent inserts -> ids 1..20, no duplicates");

const meta = (await call("GET", "/meta")).body.transactions;
assert.ok(meta.routes.includes("DELETE /api/:table/:id"));
console.log(`/api/meta lists ${meta.routes.length} transactional routes`);

await mongoose.connection.dropDatabase();
server.close();
await mongoose.disconnect();
console.log("ACID check passed");
