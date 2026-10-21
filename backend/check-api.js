// node --env-file-if-exists=.env check-api.js — HTTP smoke test of the app's routes against MONGODB_URI (needs `npm run seed`).
// Leaves no trace: the only writes are a like and a follow that are undone straight away.
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.VERCEL = "1"; // import the app without server.js listening on PORT
const { default: app } = await import("./server.js");
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
const json = { "Content-Type": "application/json" };

const login = (email, password) => fetch(base + "/auth/login", { method: "POST", headers: json, body: JSON.stringify({ email, password }) });
assert.equal((await login("omkar@gmail.com", "wrong")).status, 401, "wrong password");
const ok = await login("omkar@gmail.com", "spooftify123");
assert.equal(ok.status, 200, "login (run npm run seed first)");
const cookie = ok.headers.get("set-cookie").split(";")[0];
const call = (path, init = {}) => fetch(base + path, { ...init, headers: { cookie, ...json, ...init.headers } });
const get = async (path) => (await call(path)).json();
const me = await get("/me");

// auth guard
assert.equal((await fetch(base + "/me/likes")).status, 401, "logged out -> 401");

// like round trip (PUT then DELETE, both transactional)
const song = (await get("/views/Song_Details?_limit=1&_sort=plays"))[0].song_id;
const had = (await get("/me/likes")).includes(song);
await call(`/like/${song}`, { method: "PUT" });
assert.ok((await get("/me/likes")).includes(song), "liked");
if (!had) await call(`/like/${song}`, { method: "DELETE" });
assert.equal((await get("/me/likes")).includes(song), had, "like undone");

// follow round trip + following yourself is refused by the trigger
const artist = (await get("/views/Artist_Summary?_limit=1"))[0].artist_id;
const following = (await get("/me/follows")).some((f) => f.kind === "artist" && f.target_id === artist);
assert.equal((await call(`/follow/artist/${artist}`, { method: "PUT" })).status, 200);
if (!following) await call(`/follow/artist/${artist}`, { method: "DELETE" });
assert.equal((await call(`/follow/user/${me.user_id}`, { method: "PUT" })).status, 400, "cannot follow yourself");

// playlist guards: validation and ownership, all refused before anything is written
const lib = await get("/me/library");
const own = lib.playlists.find((p) => !p.shared);
assert.ok(own, "seeded user owns a playlist");
for (const body of [{}, { song_ids: "x" }, { song_ids: [1, 1] }, { song_ids: [99999999] }])
  assert.equal((await call(`/playlists/${own.playlist_id}/order`, { method: "PUT", body: JSON.stringify(body) })).status, 400, `order ${JSON.stringify(body)}`);
const others = (await get("/views/Playlist_Summary")).find((p) => p.user_id !== me.user_id && !lib.playlists.some((m) => m.playlist_id === p.playlist_id));
assert.equal((await call(`/playlists/${others.playlist_id}/songs`, { method: "POST", body: JSON.stringify({ song_id: song }) })).status, 403, "not your playlist");
assert.equal((await call(`/playlists/${others.playlist_id}`, { method: "DELETE" })).status, 403, "only the owner deletes");

// read endpoints answer with the right shape
const stats = await get("/me/stats?days=99999&tz=Not/AZone");
assert.equal(stats.days, 3650, "days clamped");
assert.equal(stats.by_hour.length, 24);
assert.equal(stats.by_day.length, 90);
assert.ok(Array.isArray((await get("/me/feed")).events), "feed");
const radio = await get(`/radio/${song}?exclude=${song}`);
assert.ok(radio.length > 0 && !radio.some((s) => s.song_id === song), "radio skips the seed");
assert.ok((await get("/search?q=a")).songs.length > 0, "search");
const page = await call("/Listens?_limit=2");
assert.equal((await page.json()).length, 2, "table paging");
assert.ok(+page.headers.get("x-total-count") >= 2, "X-Total-Count");
assert.equal((await call("/views/Nope")).status, 404);
assert.equal((await call("/Nope")).status, 404);
assert.ok((await get("/meta")).transactions.routes.includes("PUT /api/like/:song"), "meta lists tx routes");

console.log("check-api: all good");
server.close();
await mongoose.disconnect();
