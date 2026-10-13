// Loads the database from seed-data.json (real artists, albums, songs: see build-seed-data.js) plus users, playlists and listening activity.
// Everything goes through Model.create so the triggers run exactly like the SQL INSERTs.
// Every seeded user logs in with the password "spooftify123".
import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { User, Artist, Genre, Album, Songs, Playlist, Contains, RemovedSong, Liked, Follow, Listen, Collaborator } from "./models.js";
import { createViews } from "./views.js";
import { hashPassword } from "./auth.js";

const data = JSON.parse(readFileSync(new URL("./seed-data.json", import.meta.url)));

await mongoose.connect(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/spotify_miniproject");
await mongoose.connection.dropDatabase();
await Promise.all([User, Artist, Genre, Album, Songs, Playlist, Contains, Liked, Follow, Listen, Collaborator].map((m) => m.syncIndexes()));

// ---------- User (id, name, email, phone) ----------
// emails are deliberately mixed-case: before_user_insert lowercases them. Phones are dummy numbers in a valid 10-digit format.
const password_hash = hashPassword("spooftify123");
const users = [
  [1, "omkar_g", "Omkar@gmail.com"], [2, "ibrahim_f", "ibrahim@gmail.com"], [3, "keval_g", "Keval@yahoo.com"],
  [4, "samridihi_g", "samridihi@gmail.com"], [5, "parth_g", "ParthG@gmail.com"], [6, "heet_m", "heetm@gmail.com"],
  [7, "aarav_s", "Aarav.S@Gmail.com"], [8, "diya_p", "Diya.P@outlook.com"], [9, "rohan_k", "ROHAN.K@yahoo.com"],
  [10, "ananya_m", "ananya.m@gmail.com"], [11, "vivaan_r", "Vivaan.R@gmail.com"], [12, "ishita_j", "ishita.j@spit.ac.in"],
  [13, "kabir_d", "Kabir.D@gmail.com"], [14, "meera_n", "meera.n@hotmail.com"], [15, "arjun_t", "Arjun.T@gmail.com"],
];

// ---------- Playlists: [id, name, is_public, user_id, "SONG, SONG, ..."] (songs matched by name) ----------
const playlists = [
  [1, "LATE NIGHT VIBES", true, 1, "BLINDING LIGHTS, DIE FOR YOU, STARBOY, OCEAN EYES, CARDIGAN, KUN FAYA KUN"],
  [2, "WORKOUT MIX", true, 1, "STRONGER, BELIEVER, THUNDER, GOOD 4 U, UPTOWN FUNK, HUMBLE."],
  [3, "BOLLYWOOD", false, 4, "TUM HI HO, KESARIYA, CHAIYYA CHAIYYA, JAI HO, KABIRA, BADTAMEEZ DIL"],
  [4, "CHILL POP", true, 3, "SHAPE OF YOU, CARDIGAN, PERFECT, WATERMELON SUGAR, AS IT WAS, LEVITATING"],
  [5, "ROAD VIBES", false, 2, "YELLOW, VIVA LA VIDA, 505, DO I WANNA KNOW?, LAST NITE, DEMONS"],
  [6, "STUDY", false, 6, "FIX YOU, THE SCIENTIST, OCEAN EYES, PHOTOGRAPH, SUNFLOWER"],
  [7, "ARIJIT ESSENTIALS", true, 1, "TUM HI HO, KESARIYA, CHANNA MEREYA, AGAR TUM SAATH HO, ILAHI, PHIR LE AYA DIL"],
  [8, "PUNJABI HEAT", true, 2, "SOFTLY, TAUBA TAUBA, WINNING SPEECH, 52 BARS, BORN TO SHINE, LOVER, G.O.A.T., EXCUSES, BROWN MUNDE, WITH YOU"],
  [9, "POP HITS 2020S", true, 3, "ANTI-HERO, LEVITATING, AS IT WAS, ESPRESSO, GOOD 4 U, VAMPIRE, PEACHES, BLINDING LIGHTS, DIE WITH A SMILE, BIRDS OF A FEATHER"],
  [10, "RAP CAVIAR", true, 5, "HUMBLE., NOT LIKE US, MONEY TREES, SICKO MODE, GOOSEBUMPS, GOD'S PLAN, STRONGER, HEARTLESS, RUNAWAY"],
  [11, "INDIE ROCK", false, 6, "REPTILIA, LAST NITE, SOMEDAY, THE ADULTS ARE TALKING, DO I WANNA KNOW?, 505, R U MINE?, YELLOW"],
  [12, "SAD HOURS", true, 4, "FIX YOU, THE SCIENTIST, DRIVERS LICENSE, HELLO, EASY ON ME, TUM HI HO, CHANNA MEREYA, DIE FOR YOU"],
  [13, "SOUTH SWAG", true, 7, "CHALEYA, ARABIC KUTHU, HUKUM, SRIVALLI, INKEM INKEM"],
  [14, "SUFI NIGHTS", true, 8, "KUN FAYA KUN, KABIRA, TERI ORE, JEENE LAGA HOON, DIL SE RE"],
  [15, "PARTY ANTHEMS", true, 9, "BADTAMEEZ DIL, GENDA PHOOL, DJ WALE BABU, AAJ KI RAAT, DARD-E-DISCO, BESHARAM RANG, UPTOWN FUNK, DYNAMITE, TITI ME PREGUNTO, ONE DANCE"],
  [16, "GYM BEAST", true, 10, "BELIEVER, THUNDER, STRONGER, SICKO MODE, STARBOY, HUMBLE., ROCKSTAR"],
  [17, "LOFI STUDY", false, 11, "OCEAN EYES, SUNFLOWER, PHOTOGRAPH, PERFECT, CIRCLES, LOVE YOURSELF, TERE VASTE"],
  [18, "THROWBACK 2010S", true, 12, "LOVE STORY, BLANK SPACE, THINKING OUT LOUD, HOTLINE BLING, NEW RULES, DEMONS, LOCKED OUT OF HEAVEN, VIVA LA VIDA"],
  [19, "K-POP & LATIN", true, 13, "DYNAMITE, BUTTER, DAKITI, TITI ME PREGUNTO"],
  [20, "ROMANTIC BOLLYWOOD", true, 14, "TUM HI HO, PEHLI NAZAR MEIN, TERE LIYE, SUN RAHA HAI, APNA BANA LE, JEENE LAGA HOON, TERI ORE, AGAR TUM SAATH HO"],
];
// shared playlists: [playlist_id, collaborator user_id]
const collaborators = [[15, 7], [15, 8], [1, 2], [4, 4], [9, 5], [18, 13], [10, 3]];
// songs taken out of a playlist later: [playlist_id, song]. after_contains_delete logs each one to Removed_Songs
const removals = [[17, "PERFECT"], [6, "SUNFLOWER"], [12, "HELLO"], [2, "UPTOWN FUNK"]];

// ==================== INSERTS ====================
await Artist.create(data.artists.map((a) => ({ _id: a.id, artist_name: a.name, country: a.country, image: a.image, bio: a.bio, bio_url: a.bio_url, fans: a.fans })));
await User.create(users.map(([_id, user_name, email]) => ({ _id, user_name, email, phone: 9_000_000_000 + _id, password_hash })));
await Genre.create(data.genres.map((g) => ({ _id: g.id, genre_name: g.name })));
await Album.create(data.albums.map((a) => ({ _id: a.id, album_name: a.name, artist_id: a.artist_id, release_year: a.year, cover: a.cover })));
for (const s of data.songs)
  await Songs.create({
    _id: s.id, song_name: s.name, duration: s.duration, artist_id: s.artist_id, album_id: s.album_id, genre_id: s.genre_id, track_no: s.track_no,
    audio_file: s.audio_file ?? `https://www.youtube.com/watch?v=${s.youtube_id}`, youtube_id: s.youtube_id, yt_views: s.yt_views,
  });

const songId = new Map((await Songs.find({}, "song_name")).map((s) => [s.song_name, s._id]));
const idOf = (name) => {
  if (!songId.has(name)) throw new Error(`Unknown song in seed: ${name}`);
  return songId.get(name);
};
const inPlaylist = new Map(); // playlist_id -> [song_id]
for (const [_id, playlist_name, is_public, user_id, list] of playlists) {
  await Playlist.create({ _id, playlist_name, is_public, user_id });
  inPlaylist.set(_id, list.split(", ").map(idOf));
  for (const song_id of inPlaylist.get(_id)) await Contains.create({ playlist_id: _id, song_id });
}
for (const [playlist_id, user_id] of collaborators) await Collaborator.create({ playlist_id, user_id });
for (const [playlist_id, name] of removals) await Contains.findOneAndDelete({ playlist_id, song_id: idOf(name) });
for (const [playlist_id, name] of removals) inPlaylist.set(playlist_id, inPlaylist.get(playlist_id).filter((id) => id !== idOf(name)));

// ---------- activity: listens, likes, follows (deterministic, so every seed run gives the same numbers) ----------
// Each user mostly listens to their own playlists, plus whatever is popular. The after_listen_insert trigger fills Songs.plays.
let state = 20260924;
const rand = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const sample = (arr, n) => [...arr].sort(() => rand() - 0.5).slice(0, n);
const allSongs = [...songId.values()];
const popular = data.songs.filter((s) => s.yt_views).sort((a, b) => b.yt_views - a.yt_views).slice(0, 30).map((s) => s.id);
const artistOf = new Map(data.songs.map((s) => [s.id, s.artist_id]));

for (const [uid] of users) {
  const own = playlists.filter((p) => p[3] === uid).flatMap((p) => inPlaylist.get(p[0]));
  const taste = own.length ? own : sample(allSongs, 8);
  for (let i = 0; i < 40; i++) {
    const song_id = rand() < 0.6 ? pick(taste) : rand() < 0.6 ? pick(popular) : pick(allSongs);
    await Listen.create({ user_id: uid, song_id, played_at: new Date(Date.now() - rand() * 45 * 864e5) });
  }
  for (const song_id of sample([...new Set(taste)], 6 + Math.floor(rand() * 6))) await Liked.create({ user_id: uid, song_id });
  for (const artist_id of new Set(sample(taste, 5).map((id) => artistOf.get(id)))) await Follow.create({ user_id: uid, kind: "artist", target_id: artist_id });
  for (const p of sample(playlists.filter((p) => p[2] && p[3] !== uid), 2)) await Follow.create({ user_id: uid, kind: "playlist", target_id: p[0] });
  await Follow.create({ user_id: uid, kind: "user", target_id: pick(users.filter(([id]) => id !== uid))[0] }).catch(() => {}); // duplicate pick is fine
}

await createViews(mongoose.connection.db);
for (const m of [Artist, User, Genre, Album, Songs, Playlist, Contains, RemovedSong, Liked, Follow, Listen, Collaborator]) console.log(`${m.collection.name}: ${await m.countDocuments()} rows`);
await mongoose.disconnect();
