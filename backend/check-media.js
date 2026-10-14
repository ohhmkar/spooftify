// node --env-file-if-exists=.env check-media.js — BinData photos + GridFS Canvas round trip against MONGODB_URI (needs `npm run seed`).
// Creates its own test song and deletes it again; puts a photo on omkar@gmail.com and a cover on their first playlist.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";

process.env.VERCEL = "1"; // import the app without server.js listening on PORT
const { default: app } = await import("./server.js");
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;

const login = await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "omkar@gmail.com", password: "spooftify123" }) });
assert.equal(login.status, 200, "login (run npm run seed first)");
const cookie = login.headers.get("set-cookie").split(";")[0];
const call = (path, init = {}) => fetch(base + path, { ...init, headers: { cookie, ...init.headers } });
const put = (path, body, type) => call(path, { method: "PUT", body, headers: { "Content-Type": type } });
const bytes = async (r) => Buffer.from(await r.arrayBuffer());
const me = await (await call("/me")).json();

// 1) BinData: profile picture (a real 1x1 PNG) inside the User document
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
assert.equal((await put("/me/photo", png, "image/png")).status, 200);
const [pub] = await (await call(`/views/User_Public?user_id=${me.user_id}`)).json();
const photo = await fetch(base.replace("/api", "") + pub.photo);
assert.equal(photo.status, 200);
assert.equal(photo.headers.get("content-type"), "image/png");
assert.match(photo.headers.get("cache-control"), /max-age/);
assert.deepEqual(await bytes(photo), png, "photo byte-identical");
const userJson = JSON.stringify(await (await call(`/User/${me.user_id}`)).json());
assert.ok(!userJson.includes('"photo":'), "binary never in normal JSON");
assert.equal((await put("/me/photo", png, "text/plain")).status, 415, "non-image rejected");
assert.equal((await put("/me/photo", randomBytes(4 * 1024 * 1024 + 1), "image/png")).status, 413, "over 4 MB rejected");
console.log("ok  photo: BinData in User, served as image/png, byte-identical, hidden from JSON, 415/413 checks");

// 2) BinData: playlist cover, shown through Playlist_Summary.cover
const [pl] = await (await call("/me/playlists")).json();
const jpg = randomBytes(5000);
const { image } = await (await put(`/playlists/${pl._id}/cover`, jpg, "image/jpeg")).json();
const [sum] = await (await call(`/views/Playlist_Summary?playlist_id=${pl._id}`)).json();
assert.equal(sum.cover, image);
assert.deepEqual(await bytes(await fetch(base.replace("/api", "") + image)), jpg, "cover byte-identical");
assert.ok(!JSON.stringify(await (await call(`/Playlist/${pl._id}`)).json()).includes('"cover":'));
console.log(`ok  cover: BinData in Playlist ${pl._id}, Playlist_Summary.cover = ${image}`);

// 3) GridFS: Canvas video on a fresh test song
const song = await (await call("/Songs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ song_name: "canvas check", duration: 10, audio_file: "X.MP3", artist_id: 1 }) })).json();
assert.equal((await put(`/songs/${song._id}/canvas`, randomBytes(100), "video/ogg")).status, 415, "only mp4/webm");
const first = (await (await put(`/songs/${song._id}/canvas`, randomBytes(1000), "video/webm")).json()).canvas_id;
const video = randomBytes(600 * 1024); // > 2 x 255 KB = 3 chunks
const res = await put(`/songs/${song._id}/canvas`, video, "video/mp4");
assert.equal(res.status, 201);
const { canvas_id } = await res.json();
const fsdb = mongoose.connection.db;
const oid = new mongoose.Types.ObjectId(canvas_id);
assert.equal(await fsdb.collection("fs.files").countDocuments({ _id: new mongoose.Types.ObjectId(first) }), 0, "replaced canvas deleted");
assert.equal((await (await call(`/Songs/${song._id}`)).json()).canvas_id, canvas_id);

const full = await call(`/canvas/${canvas_id}`);
assert.equal(full.status, 200);
assert.equal(full.headers.get("accept-ranges"), "bytes");
assert.equal(full.headers.get("content-type"), "video/mp4");
assert.deepEqual(await bytes(full), video, "video byte-identical");
const part = await call(`/canvas/${canvas_id}`, { headers: { Range: "bytes=261000-262199" } }); // crosses the chunk 0/1 boundary (261120)
assert.equal(part.status, 206);
assert.equal(part.headers.get("content-range"), `bytes 261000-262199/${video.length}`);
assert.deepEqual(await bytes(part), video.subarray(261000, 262200), "range bytes");
const tail = await call(`/canvas/${canvas_id}`, { headers: { Range: "bytes=-10" } });
assert.equal(tail.status, 206);
assert.deepEqual(await bytes(tail), video.subarray(-10));
assert.equal((await call(`/canvas/${canvas_id}`, { headers: { Range: `bytes=${video.length}-` } })).status, 416);
const [row] = await (await call("/views/GridFS_Files")).json().then((r) => r.filter((f) => f.file_id === canvas_id));
assert.equal(row.chunks, 3);
assert.equal(row.song_id, song._id);
console.log(`ok  canvas: GridFS file ${canvas_id} (${row.length} B in ${row.chunks} chunks), 200 + 206 Range + 416, old file removed on replace`);

// 4) deleting the song (after_song_delete) removes fs.files + fs.chunks
assert.equal((await call(`/Songs/${song._id}`, { method: "DELETE" })).status, 200);
assert.equal(await fsdb.collection("fs.files").countDocuments({ _id: oid }), 0, "fs.files gone");
assert.equal(await fsdb.collection("fs.chunks").countDocuments({ files_id: oid }), 0, "fs.chunks gone");
assert.equal((await call(`/canvas/${canvas_id}`)).status, 404);
console.log("ok  delete song -> its GridFS file and chunks are gone");

server.close();
await mongoose.disconnect();
