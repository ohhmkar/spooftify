// Grows seed-data.json ADDITIVELY from artists-to-add.txt ("Name | CC" per line, optional "| iTunes name" when iTunes spells it differently). Existing rows are never changed, except that a missing song bpm gets filled in.
//   Deezer (no key): artist picture + fans, song bpm. Its track/album search returns nothing from here, so tracks are found via /artist/:id/radio + /album/:id/tracks
//   Wikipedia: artist bio.   iTunes Search API: songs, album, release year, track no., duration, 30s preview
// youtube_id stays empty: GET /api/play/:id looks it up on first play.
// Saves after every artist, so a killed run just resumes:  node add-to-catalog.js [--only=Name,Name] [--limit=N] [--retry]
// Doubtful matches are printed and kept in .add-to-catalog-state.json for hand review.
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

const FILE = `${import.meta.dirname}/seed-data.json`, STATE = `${import.meta.dirname}/.add-to-catalog-state.json`;
const data = JSON.parse(readFileSync(FILE));
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE)) : { failed: {}, doubtful: [], bpm_done: [] };
const save = () => {
  writeFileSync(FILE + ".tmp", JSON.stringify(data, null, 1)); // same format as build-seed-data.js; tmp + rename so a kill never leaves half a file
  renameSync(FILE + ".tmp", FILE);
  writeFileSync(STATE, JSON.stringify(state, null, 1));
};
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}`))?.split("=")[1] ?? process.argv.includes(`--${k}`);
const doubt = (msg) => { console.log("  DOUBTFUL", msg); state.doubtful.push(msg); };

const norm = (s) => s.normalize("NFD").toLowerCase().replace(/[^a-z0-9]/g, ""); // NFD splits accents off, so Beyoncé == beyonce
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url, wait, headers) => {
  for (let i = 0; i < 6; i++) {
    await sleep(wait * (i ? 4 * i : 1));
    const r = await fetch(url, { headers }).catch(() => null);
    const json = r?.ok ? await r.json().catch(() => null) : null;
    if (json && json.error?.code !== 4) return json; // Deezer quota error = code 4: back off and retry
  }
  return {};
};
const dz = (path) => get(`https://api.deezer.com${path}`, 250); // Deezer: ~50 req / 5 s
const itunes = async (term, country) => (await get(`https://itunes.apple.com/search?${new URLSearchParams({ term, country, media: "music", entity: "song", attribute: "artistTerm", limit: "200" })}`, 3300)).results ?? []; // ~20 req/min

// Wikipedia titles that differ from the artist name; otherwise the first of `${name} (singer)` ... `${name}` that is about a musician wins
const WIKI = { "Shankar-Ehsaan-Loy": "Shankar–Ehsaan–Loy", "Salim-Sulaiman": "Salim–Sulaiman", Queen: "Queen (band)", Future: "Future (rapper)", Muse: "Muse (band)", "Thaman S": "Thaman S", Shubh: "Shubh (singer)", Divine: "Divine (rapper)", "Imran Khan": "Imran Khan (singer)", "Bob Marley & The Wailers": "Bob Marley and the Wailers", Oasis: "Oasis (band)", KK: "KK (singer)" };
const MUSIC = /\b(singer|band|rapper|musician|composer|dj|disc jockey|producer|songwriter|group|duo|vocalist|playback|music director|trio|lyricist)\b/i;
async function wiki(name) {
  const titles = [WIKI[name], ...["singer", "rapper", "musician", "band", "South Korean band", "group", "DJ", "composer"].map((s) => `${name} (${s})`), name].filter(Boolean);
  const wp = new URLSearchParams({ action: "query", format: "json", titles: titles.join("|"), redirects: "1", prop: "extracts|info", inprop: "url", exintro: "1", explaintext: "1", exsentences: "3", exlimit: "max" });
  const res = await get(`https://en.wikipedia.org/w/api.php?${wp}`, 1500, { "User-Agent": "SpooftifyMiniProject/1.0 (college DBMS project)" }); // Wikipedia asks for politeness
  const to = (t) => [...(res.query?.normalized ?? []), ...(res.query?.redirects ?? [])].reduce((t, m) => (m.from === t ? m.to : t), t);
  const pages = Object.values(res.query?.pages ?? {});
  for (const t of titles) {
    const p = pages.find((p) => p.title === to(t) && !p.missing && p.extract);
    if (p && MUSIC.test(p.extract) && !/may refer to/.test(p.extract)) return p;
  }
}

// iTunes primaryGenreName -> genre id (first match wins); songs that match nothing get the artist's most common genre
const GENRES = [["Rock", 11], ["Electronic", 12]];
for (const [name, id] of GENRES) if (!data.genres.some((g) => g.id === id)) data.genres.push({ id, name });
const GENRE_OF = [[/k-pop|korean/i, 5], [/latin|urbano|reggaeton|mexic|salsa|bachata|tropical|flamenco/i, 6], [/punjabi/i, 8], [/tamil|telugu|malayalam|kannada/i, 10], [/bollywood/i, 2], [/indian pop|ghazal|sufi|devotional|indian classical|regional indian/i, 4], [/hip-hop|hip hop|rap/i, 3], [/r&b|soul|funk/i, 9], [/alternative|indie/i, 1], [/rock|metal|punk|grunge/i, 11], [/dance|electronic|house|techno|trance|dubstep/i, 12], [/pop|singer|country|vocal|jazz|reggae|blues|christian/i, 7]];

const BAD_ALBUM = /hits|best of|greatest|mix|playlist|essentials|karaoke|tribute|workout|party|lofi|remix|version|deluxe|anthems|top \d/i; // as in build-seed-data.js: only used to prefer the original album
const BAD = /\b(live|remix(ed)?|karaoke|instrumental|cover|lo-?fi|slowed|reverb|sped up|acoustic|unplugged|reprise|demo|edit|mashup|medley|version|mix|commentary|interview|intro|outro|skit|interlude|tribute|lullaby|8d|jhankar|dialogue)\b/i;
// "Kesariya (From "Brahmastra")", "Sweet Nothing (feat. Florence Welch)", "Feel So Close (Radio Edit)" -> the bare song name
const clean = (t) => t.replace(/\s*[([](feat|ft|with|from|prod|radio edit|original mix|single version|album version)\b[^)\]]*[)\]]/gi, "").replace(/\s+-\s+(from|feat|single|radio edit)\b.*$/i, "").replace(/\s+/g, " ").trim();
const credits = (t) => [t.artistName, ...t.artistName.split(/\s*(?:,|&|\bx\b|\bfeat\.?|\bft\.?|\bwith\b|\band\b)\s*/i), ...[...t.trackName.matchAll(/\b(?:feat|ft|with)\.?\s+([^)\]]+)/gi)].flatMap((m) => m[1].split(/\s*(?:,|&|\band\b)\s*/i))].map(norm).filter(Boolean);
const primary = (t, name) => { const a = t.artistName.toLowerCase(), n = name.toLowerCase(); return norm(t.artistName) === norm(name) || (a.startsWith(n) && /^(\s*[,&(]|\s+(feat|ft|x|with|and)\b)/.test(a.slice(n.length))); };

const artistNorm = new Map(data.artists.map((a) => [a.id, norm(a.name)]));
const songsByName = new Map(); // norm(song name) -> [artist ids]
const indexSong = (s) => songsByName.set(norm(s.name), [...(songsByName.get(norm(s.name)) ?? []), s.artist_id]);
data.songs.forEach(indexSong);
const albumByItunes = new Map(data.albums.filter((a) => a.itunes_id).map((a) => [a.itunes_id, a]));
const nextId = (rows) => Math.max(0, ...rows.map((r) => r.id)) + 1;

async function pickSongs(name, country, artist_id) {
  const stores = ["IN", "PK"].includes(country) ? ["in", "us"] : ["us", "in"];
  let res = [];
  for (const store of stores) {
    res = res.concat(await itunes(name, store));
    const byKey = new Map(); // song key -> candidate tracks, in iTunes (≈ popularity) order
    for (const t of res) {
      if (t.kind !== "song" || !t.previewUrl || !t.trackTimeMillis || !(credits(t).includes(norm(name)) || primary(t, name))) continue;
      const song = clean(t.trackName).toUpperCase();
      if (!song || song.length > 40 || BAD.test(song) || /karaoke|tribute|lo-?fi|remix|live\b|instrumental|cover|slowed|8d/i.test(t.collectionName)) continue;
      const key = norm(song);
      if (!key || songsByName.get(key)?.some((id) => id === artist_id || credits(t).includes(artistNorm.get(id)))) continue; // already in the catalog (maybe as a collab)
      byKey.set(key, [...(byKey.get(key) ?? []), { ...t, song }]);
    }
    // own songs before features, then the original album (earliest, not a compilation) of each
    const picks = [...byKey.values()].sort((a, b) => primary(b[0], name) - primary(a[0], name)).slice(0, 13)
      .map((ts) => ts.sort((x, y) => BAD_ALBUM.test(x.collectionName) - BAD_ALBUM.test(y.collectionName) || x.releaseDate.localeCompare(y.releaseDate))[0]);
    if (picks.length >= 10 || store === stores[1]) return picks;
  }
}

// Deezer bpm: collect the artist's tracks (radio + every album that shows up in it), match on name + duration, then /track/:id has bpm (0 = unknown)
async function addBpm(dzId, songs) {
  const todo = songs.filter((s) => s.bpm == null);
  if (!dzId || !todo.length) return 0;
  const tracks = [], albums = new Set();
  for (let i = 0; i < 4; i++) for (const t of (await dz(`/artist/${dzId}/radio`)).data ?? []) if (t.artist?.id === dzId) { tracks.push(t); albums.add(t.album.id); } // radio is random, so ask a few times
  for (const id of [...albums].slice(0, 15)) tracks.push(...((await dz(`/album/${id}/tracks?limit=100`)).data ?? []));
  let n = 0;
  for (const s of todo) {
    const hit = tracks.find((t) => norm(clean(t.title)) === norm(s.name) && !BAD.test(clean(t.title)) && Math.abs(t.duration - s.duration) <= 10); // title, not title_short: that one hides "(… Remix)"
    const bpm = hit && (await dz(`/track/${hit.id}`)).bpm;
    if (bpm > 0) { s.bpm = Math.round(bpm); n++; }
  }
  return n;
}
const deezerArtist = async (name) => ((await dz(`/search/artist?limit=10&q=${encodeURIComponent(name)}`)).data ?? []).filter((d) => norm(d.name) === norm(name)).sort((x, y) => y.nb_fan - x.nb_fan)[0];

const only = typeof arg("only") === "string" ? arg("only").split(",").map(norm) : null;
const have = new Set(data.artists.map((a) => norm(a.name)));
let list = readFileSync(`${import.meta.dirname}/artists-to-add.txt`, "utf8").split("\n").map((l) => l.split("|").map((x) => x.trim())).filter(([n, c]) => n && c);
list = list.filter(([n]) => !have.has(norm(n)) && (!only || only.includes(norm(n))) && (arg("retry") || !state.failed[n]));
if (typeof arg("limit") === "string") list = list.slice(0, +arg("limit"));
console.log(`${list.length} artists to add`);

for (const [name, country, itunesName] of list) {
  const id = nextId(data.artists);
  const songs = await pickSongs(itunesName || name, country.slice(0, 2).toUpperCase(), id);
  if (!songs.length) { state.failed[name] = "no iTunes songs"; console.log("FAILED", name, "no iTunes songs"); save(); continue; }
  const [hit, page] = [await deezerArtist(name), await wiki(name)];
  if (!hit) doubt(`${name}: no exact Deezer artist (no picture, fans 0)`);
  if (!page) doubt(`${name}: no Wikipedia bio`);
  else if (norm(page.title.replace(/\(.*\)/, "")) !== norm(name)) doubt(`${name}: Wikipedia page "${page.title}"`);
  if (songs.length < 8) doubt(`${name}: only ${songs.length} songs`);
  data.artists.push({ id, name: name.slice(0, 40), country: country.slice(0, 2).toUpperCase(), image: hit?.picture_xl, fans: hit?.nb_fan ?? 0, bio: page?.extract.replace(/\s+/g, " ").trim().slice(0, 1000), bio_url: page?.fullurl?.slice(0, 255), wiki_title: page?.title });
  artistNorm.set(id, norm(name));

  const rows = [];
  for (const t of songs) {
    let album = albumByItunes.get(t.collectionId);
    if (!album) {
      // ponytail: album names over 100 chars are cut, not rewritten
      album = { id: nextId(data.albums), name: t.collectionName.replace(/ - (Single|EP)$/, "").slice(0, 100), artist_id: id, year: Math.max(1900, +t.releaseDate.slice(0, 4)), cover: t.artworkUrl100.replace("100x100bb", "600x600bb"), itunes_id: t.collectionId };
      data.albums.push(album);
      albumByItunes.set(t.collectionId, album);
    }
    const genre = GENRE_OF.find(([re]) => re.test(t.primaryGenreName))?.[1];
    if (!primary(t, itunesName || name)) doubt(`${name}: "${t.song}" is credited to "${t.artistName}"`);
    const duration = Math.round(t.trackTimeMillis / 1000);
    if (duration < 60 || duration > 600) doubt(`${name}: "${t.song}" is ${duration}s long`);
    rows.push({ id: nextId(data.songs) + rows.length, name: t.song, artist_id: id, duration, album_id: album.id, track_no: t.trackNumber || 1, audio_file: t.previewUrl.slice(0, 255), genre_id: genre });
  }
  const counts = {};
  for (const r of rows) if (r.genre_id) counts[r.genre_id] = (counts[r.genre_id] ?? 0) + 1;
  const main = +Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || (country === "IN" ? 2 : 7);
  for (const r of rows) r.genre_id ??= main;
  const bpm = await addBpm(hit?.id, rows);
  data.songs.push(...rows);
  rows.forEach(indexSong);
  state.bpm_done.push(id);
  delete state.failed[name];
  save();
  console.log(`${id} ${name} | ${hit?.nb_fan ?? "-"} fans | ${page?.title ?? "-"} | ${rows.length} songs, ${bpm} bpm | ${rows.map((r) => r.name).join(", ")}`);
}

// bpm for the songs that were already there (the only change to existing rows)
if (!only && !arg("limit")) {
  for (const a of data.artists.filter((a) => !state.bpm_done.includes(a.id))) {
    const n = await addBpm((await deezerArtist(a.name))?.id, data.songs.filter((s) => s.artist_id === a.id));
    state.bpm_done.push(a.id);
    save();
    console.log(`bpm ${a.name}: ${n}`);
  }
}
const bpmCount = data.songs.filter((s) => s.bpm).length;
console.log(`\nDOUBTFUL (all runs):\n${state.doubtful.join("\n")}\nFAILED: ${JSON.stringify(state.failed)}`);
console.log(`\ncatalog: ${data.artists.length} artists, ${data.albums.length} albums, ${data.songs.length} songs (${bpmCount} with bpm), ${data.genres.length} genres`);
