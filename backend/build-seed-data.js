// NOTE: seed-data.json was hand-corrected after this ran (album fixes, renamed songs, genres), so do not rebuild it blindly.
// One-off: turns the current DB rows into backend/seed-data.json with real data, so `npm run seed` is deterministic and offline.
//   Deezer (no key): real durations, album, release year, track no., 30s audio preview, artist fans + picture
//   Wikipedia: artist bio.   YouTube id / view counts: copied from the DB (fetch-media.js already paid the quota for them)
// Prints every song whose Deezer match looked doubtful so it can be checked by hand.
import mongoose from "mongoose";
import { writeFileSync } from "node:fs";

// hand fixes to the original filler rows: [song_id, { name?, artist? }]
const FIXES = { 11: { name: "Runaway" }, 44: { artist: "Sachin-Jigar" } };
const ARTIST_FIX = { "Arjit Singh": "Arijit Singh" };
const norm = (s) => s.toLowerCase().replace(/\(.*?\)|-.*$|[^a-z0-9]/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dz = async (path) => {
  for (;;) {
    await sleep(250); // Deezer: ~50 req / 5 s
    const data = await (await fetch(`https://api.deezer.com${path}`)).json().catch(() => ({ error: { code: 4 } }));
    if (data.error?.code !== 4) return data;
    await sleep(3000); // quota error: back off and retry
  }
};
// Wikipedia titles that differ from the artist name (disambiguation / en-dash spelling)
const WIKI = { Drake: "Drake (musician)", Pritam: "Pritam Chakraborty", Badshah: "Badshah (rapper)", "Vishal-Shekhar": "Vishal–Shekhar", "Sachin-Jigar": "Sachin–Jigar", "Sid Sriram": "Sid Sriram", "The Weeknd": "The Weeknd", "Kendrick Lamar": "Kendrick Lamar" };

await mongoose.connect(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/spotify_miniproject");
const db = mongoose.connection.db;
const oldArtists = await db.collection("Artist").find().sort({ _id: 1 }).toArray();
const oldSongs = await db.collection("Songs").find().sort({ _id: 1 }).toArray();
const artistName = (a) => ARTIST_FIX[a.artist_name] ?? a.artist_name;

// ---- artists
const artists = [];
for (const a of oldArtists) {
  const name = artistName(a);
  const hit = ((await dz(`/search/artist?limit=10&q=${encodeURIComponent(name)}`)).data ?? []).filter((d) => norm(d.name) === norm(name)).sort((x, y) => y.nb_fan - x.nb_fan)[0];
  const wp = new URLSearchParams({ action: "query", format: "json", titles: WIKI[name] ?? name, redirects: "1", prop: "extracts|info", inprop: "url", exintro: "1", explaintext: "1", exsentences: "3" });
  let wiki = {};
  for (let i = 0; i < 6 && !wiki.query; i++) {
    await sleep(1500 * (i + 1)); // Wikipedia asks for politeness; back off on "too many requests"
    wiki = await (await fetch(`https://en.wikipedia.org/w/api.php?${wp}`, { headers: { "User-Agent": "SpootifyMiniProject/1.0 (college DBMS project)" } })).json().catch(() => ({}));
  }
  const page = Object.values(wiki.query?.pages ?? {}).find((p) => !p.missing);
  artists.push({ id: a._id, name, country: a.country, image: hit?.picture_xl ?? a.image, fans: hit?.nb_fan ?? 0, bio: page?.extract?.replace(/\s+/g, " ").trim(), bio_url: page?.fullurl, wiki_title: page?.title });
  console.log("artist", name, "|", page?.title, "|", hit?.nb_fan);
}
const byId = new Map(artists.map((a) => [a.id, a]));
const idByName = new Map(artists.map((a) => [a.name, a.id]));

// ---- songs + albums (iTunes Search API: no key, ~20 requests/minute; Deezer's track search returns nothing from here)
const BAD_ALBUM = /hits|best of|greatest|mix|playlist|essentials|karaoke|tribute|workout|party|lofi|remix|version|deluxe|anthems|top \d/i;
const itunes = async (term, country) => {
  for (let i = 0; i < 5; i++) {
    await sleep(3300);
    const r = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term, entity: "song", limit: "25", country })}`);
    if (r.ok) return (await r.json()).results;
    await sleep(15000); // rate limited
  }
  return [];
};
const albums = new Map(); // deezer album id -> album
const songs = [];
const doubtful = [];
for (const s of oldSongs) {
  const fix = FIXES[s._id] ?? {};
  const name = fix.name ?? s.song_name;
  const artist_id = fix.artist ? idByName.get(fix.artist) : s.artist_id;
  const artist = byId.get(artist_id).name;
  const want = norm(name);
  const pick = (res) => {
    const ok = res.filter((t) => norm(t.trackName) === want && norm(t.artistName).includes(norm(artist).slice(0, 8)) && !/live|remix|karaoke|instrumental|cover|lofi|slowed/i.test(t.trackName + t.collectionName));
    const good = ok.filter((t) => !BAD_ALBUM.test(t.collectionName));
    return (good.length ? good : ok).sort((x, y) => x.releaseDate.localeCompare(y.releaseDate))[0];
  };
  let hit = pick(await itunes(`${artist} ${name}`, "us")) ?? pick(await itunes(`${artist} ${name}`, "in"));
  if (!hit) { doubtful.push(`${s._id} ${name} / ${artist}: NO MATCH`); songs.push({ id: s._id, name, artist_id, duration: s.duration, youtube_id: s.youtube_id, yt_views: s.yt_views }); continue; }
  let album = albums.get(hit.collectionId);
  if (!album) {
    album = { id: albums.size + 1, name: hit.collectionName.replace(/ - (Single|EP)$/, ""), artist_id, year: +hit.releaseDate.slice(0, 4), cover: hit.artworkUrl100.replace("100x100bb", "600x600bb"), itunes_id: hit.collectionId };
    albums.set(hit.collectionId, album);
  }
  const full = { duration: Math.round(hit.trackTimeMillis / 1000), track_position: hit.trackNumber, preview: hit.previewUrl, title: hit.trackName, album: { title: hit.collectionName } };
  songs.push({
    id: s._id, name, artist_id, duration: full.duration, album_id: album.id, track_no: full.track_position,
    audio_file: full.preview, youtube_id: s.youtube_id, yt_views: s.yt_views,
    // a different fix means the old YouTube match is for the wrong song
    ...(fix.name || fix.artist ? { youtube_id: undefined, yt_views: undefined } : {}),
  });
  console.log(s._id, name, "->", full.title, "|", full.album.title, "|", full.duration, "| was", s.duration);
}
writeFileSync(new URL("./seed-data.json", import.meta.url), JSON.stringify({ artists, albums: [...albums.values()], songs }, null, 1));
console.log("\nDOUBTFUL:\n" + doubtful.join("\n"));
console.log(`\nwrote ${artists.length} artists, ${albums.size} albums, ${songs.length} songs`);
process.exit();
