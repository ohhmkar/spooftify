// Mongo port of spotify_miniproject.sql — same tables, columns, constraints and triggers.
import mongoose from "mongoose";

const { Schema, model } = mongoose;
const opts = (collection) => ({ collection, versionKey: false });
const int = { type: Number, required: true, validate: Number.isInteger };

// INT PRIMARY KEY AUTO_INCREMENT: explicit id like the SQL inserts; if omitted, Counters.seq = GREATEST(seq + 1, MAX(id) + 1).
// The $inc on one Counters row is the serialization point: two transactions taking an id write-conflict and one retries.
// MAX(id) keeps it right after seed.js / DB console inserts with explicit ids (they never touch the counter).
const Counter = model("Counters", new Schema({ _id: String, seq: Number }, opts("Counters")));
function intPk(schema) {
  schema.pre("validate", async function () {
    if (this.isNew && this._id == null) {
      const last = (await this.constructor.findOne({}, "_id").sort({ _id: -1 }))?._id ?? 0;
      const seq = [{ $set: { seq: { $max: [{ $add: [{ $ifNull: ["$seq", 0] }, 1] }, last + 1] } } }];
      this._id = (await Counter.findOneAndUpdate({ _id: this.constructor.modelName }, seq, { upsert: true, returnDocument: "after", updatePipeline: true })).seq;
    }
  });
}

// FOREIGN KEY (field) REFERENCES target — insert/update side
// ponytail: under snapshot isolation this read and a concurrent parent DELETE don't write-conflict, so an orphan can slip in;
// only Contains -> Playlist is closed (before_contains_insert writes the Playlist row). Ceiling: write the parent row here too.
function fk(schema, field, target) {
  schema.pre("save", async function () {
    if (this.isModified(field) && this[field] != null && !(await model(target).exists({ _id: this[field] })))
      throw new Error(`FOREIGN KEY violation: ${field}=${this[field]} not found in ${target}`);
  });
}

// FOREIGN KEY ... ON DELETE RESTRICT (MySQL default) — parent delete side
function restrict(schema, child, field) {
  schema.pre("findOneAndDelete", async function () {
    const id = this.getFilter()._id;
    if (await model(child).exists({ [field]: id }))
      throw new Error(`Cannot delete: rows in ${child} still reference it (${field}=${id})`);
  });
}

// ==================== SCHEMA ====================

const userSchema = new Schema(
  {
    _id: Number, // user_id
    user_name: { type: String, required: true, maxlength: 20 },
    email: { type: String, required: true, unique: true, maxlength: 50, match: [/@/, "check_email: email must contain @"] },
    phone: { ...int, unique: true },
    password_hash: { type: String, required: true, maxlength: 255 },
    // extra vs SQL: profile picture stored IN the document as BinData (fine under the 16 MB doc limit).
    // select: false = never loaded by find()/findById(), so the bytes never leak into JSON responses
    photo: { type: Buffer, select: false },
    photo_type: { type: String, match: /^image\// },
    photo_at: Date, // cache buster for the photo URL
  },
  opts("User"),
);

const artistSchema = new Schema(
  {
    _id: Number, // artist_id
    artist_name: { type: String, required: true, maxlength: 40 },
    country: { type: String, required: true, maxlength: 2 },
    image: { type: String, maxlength: 255 }, // extra vs SQL: profile picture URL
    bio: { type: String, maxlength: 1000 }, // extra vs SQL: first lines of the Wikipedia article
    bio_url: { type: String, maxlength: 255 },
    fans: { type: Number, min: 0, default: 0 }, // extra vs SQL: Deezer fan count (real-world following)
  },
  opts("Artist"),
);

const genreSchema = new Schema(
  { _id: Number, genre_name: { type: String, required: true, unique: true, maxlength: 30 } }, // genre_id
  opts("Genre"),
);

const albumSchema = new Schema(
  {
    _id: Number, // album_id
    album_name: { type: String, required: true, maxlength: 100 },
    artist_id: { ...int, ref: "Artist" },
    release_year: { ...int, min: [1900, "year_check: release_year must be >= 1900"] },
    cover: { type: String, maxlength: 255 },
  },
  opts("Album"),
);

const songSchema = new Schema(
  {
    _id: Number, // song_id
    song_name: { type: String, required: true, maxlength: 40 },
    duration: { ...int, min: [1, "dur_check: duration must be > 0"] },
    audio_file: { type: String, required: true, maxlength: 255 },
    artist_id: { ...int, ref: "Artist" },
    genre_id: { type: Number, validate: Number.isInteger, ref: "Genre" }, // extra vs SQL
    album_id: { type: Number, validate: Number.isInteger, ref: "Album" }, // extra vs SQL
    track_no: { type: Number, min: 1 },
    youtube_id: { type: String, maxlength: 20 }, // extra vs SQL: cached by GET /api/play/:id
    plays: { type: Number, default: 0, min: 0 }, // extra vs SQL: kept up to date by the after_listen_insert trigger
    yt_views: { type: Number, min: 0 }, // extra vs SQL: YouTube viewCount, fetched when youtube_id is first looked up
    canvas_id: Schema.Types.ObjectId, // extra vs SQL: looping "Canvas" video, a GridFS file (fs.files._id) — too big for BinData
    bpm: { type: Number, min: 0 }, // extra vs SQL: tempo from Deezer (missing when Deezer does not know it)
  },
  opts("Songs"),
);

const playlistSchema = new Schema(
  {
    _id: Number, // playlist_id
    playlist_name: { type: String, required: true, maxlength: 50 },
    is_public: { type: Boolean, required: true, default: true },
    user_id: { ...int, ref: "User" },
    image: { type: String, maxlength: 255 }, // extra vs SQL: custom cover URL (default cover = first song's thumbnail)
    rev: { type: Number, default: 0 }, // extra vs SQL: bumped by before_contains_insert, the row lock SELECT ... FOR UPDATE would take
    cover: { type: Buffer, select: false }, // extra vs SQL: uploaded cover as BinData; image then points at /api/playlists/:id/cover
    cover_type: { type: String, match: /^image\// },
  },
  opts("Playlist"),
);

const containsSchema = new Schema(
  { playlist_id: { ...int, ref: "Playlist" }, song_id: { ...int, ref: "Songs" }, position: { type: Number, min: 0 } }, // position: extra vs SQL, track order
  opts("Contains"),
);
containsSchema.index({ playlist_id: 1, song_id: 1 }, { unique: true }); // PRIMARY KEY (playlist_id, song_id)

const removedSchema = new Schema(
  { playlist_id: int, song_id: int, removed_at: { type: Date, default: Date.now } },
  opts("Removed_Songs"),
);

// Liked_Songs: PRIMARY KEY (user_id, song_id)
const likedSchema = new Schema(
  { user_id: { ...int, ref: "User" }, song_id: { ...int, ref: "Songs" }, liked_at: { type: Date, default: Date.now } },
  opts("Liked_Songs"),
);
likedSchema.index({ user_id: 1, song_id: 1 }, { unique: true });

// Collaborators: users (besides the owner) who may add, remove and reorder songs in a playlist. PRIMARY KEY (playlist_id, user_id)
const collabSchema = new Schema(
  { playlist_id: { ...int, ref: "Playlist" }, user_id: { ...int, ref: "User" }, added_at: { type: Date, default: Date.now } },
  opts("Collaborators"),
);
collabSchema.index({ playlist_id: 1, user_id: 1 }, { unique: true });

// Follows: one table for following an artist, a user or a playlist (kind says which table target_id points at)
const KINDS = { artist: "Artist", user: "User", playlist: "Playlist" };
const followSchema = new Schema(
  { user_id: { ...int, ref: "User" }, kind: { type: String, required: true, enum: Object.keys(KINDS) }, target_id: int, followed_at: { type: Date, default: Date.now } },
  opts("Follows"),
);
followSchema.index({ user_id: 1, kind: 1, target_id: 1 }, { unique: true });

// Listens: play history. user_id is NULL for logged-out listeners.
const listenSchema = new Schema(
  { user_id: { type: Number, validate: Number.isInteger, ref: "User" }, song_id: { ...int, ref: "Songs" }, played_at: { type: Date, default: Date.now } },
  opts("Listens"),
);
listenSchema.index({ song_id: 1 });
listenSchema.index({ user_id: 1, played_at: -1 });

for (const s of [userSchema, artistSchema, genreSchema, albumSchema, songSchema, playlistSchema]) intPk(s);
fk(songSchema, "artist_id", "Artist");
fk(songSchema, "album_id", "Album");
fk(songSchema, "genre_id", "Genre");
fk(collabSchema, "playlist_id", "Playlist");
fk(collabSchema, "user_id", "User");
fk(albumSchema, "artist_id", "Artist");
fk(likedSchema, "user_id", "User");
fk(likedSchema, "song_id", "Songs");
fk(listenSchema, "user_id", "User");
fk(listenSchema, "song_id", "Songs");
fk(followSchema, "user_id", "User");
fk(playlistSchema, "user_id", "User");
fk(containsSchema, "playlist_id", "Playlist");
fk(containsSchema, "song_id", "Songs");

// ==================== TRIGGERS ====================

// before_song_insert: trim and uppercase song names
songSchema.pre("save", function () {
  if (this.isNew) this.song_name = this.song_name.trim().toUpperCase();
});

// before_user_insert: store emails in lowercase
userSchema.pre("save", function () {
  if (this.isNew) this.email = this.email.toLowerCase();
});

// after_contains_delete: log songs removed from playlists
containsSchema.post("findOneAndDelete", async function (doc) {
  if (doc) await RemovedSong.create({ playlist_id: doc.playlist_id, song_id: doc.song_id });
});

// before_song_delete: remove a taken down song from every playlist (each removal gets logged)
songSchema.pre("findOneAndDelete", async function () {
  for (const c of await Contains.find({ song_id: this.getFilter()._id }, "_id"))
    await Contains.findOneAndDelete({ _id: c._id });
});

// before_contains_insert: stop adding songs once a playlist has 50
// Snapshot isolation alone lets two inserts both count 49 (write skew), so first write the parent Playlist row:
// concurrent inserts into one playlist then write-conflict, one aborts and the driver retries it against the new count.
// The same write makes a concurrent DELETE of the playlist conflict too (restrict check vs this FK insert).
containsSchema.pre("save", async function () {
  if (!this.isNew) return;
  await Playlist.updateOne({ _id: this.playlist_id }, { $inc: { rev: 1 } });
  if ((await Contains.countDocuments({ playlist_id: this.playlist_id })) >= 50) throw new Error("playlist is full");
});

// before_contains_insert (2nd): a new song goes to the end of the playlist
containsSchema.pre("save", async function () {
  if (this.isNew && this.position == null) {
    const last = await Contains.findOne({ playlist_id: this.playlist_id }, "position").sort({ position: -1 });
    this.position = (last?.position ?? -1) + 1;
  }
});

// before_follow_insert: target must exist in the table `kind` names, and nobody follows themselves
followSchema.pre("save", async function () {
  if (!this.isNew) return;
  if (this.kind === "user" && this.target_id === this.user_id) throw new Error("check_follow: you cannot follow yourself");
  if (!(await model(KINDS[this.kind]).exists({ _id: this.target_id })))
    throw new Error(`FOREIGN KEY violation: target_id=${this.target_id} not found in ${KINDS[this.kind]}`);
});

// before_collab_insert: the owner is already allowed, so they cannot be added as a collaborator
collabSchema.pre("save", async function () {
  if (this.isNew && (await Playlist.exists({ _id: this.playlist_id, user_id: this.user_id }))) throw new Error("check_collab: the owner cannot be a collaborator");
});

// after_listen_insert: keep Songs.plays in step with the Listens table
listenSchema.post("save", async function () {
  await Songs.updateOne({ _id: this.song_id }, { $inc: { plays: 1 } });
});

// before_song_delete (2nd): likes and play history of a taken down song go with it (ON DELETE CASCADE)
songSchema.pre("findOneAndDelete", async function () {
  const song_id = this.getFilter()._id;
  await Liked.deleteMany({ song_id }); // sequential: a transaction's session runs one operation at a time
  await Listen.deleteMany({ song_id });
});

// after_song_delete: its Canvas goes too. GridFS = fs.files (metadata) + fs.chunks (255 KB pieces); bucket.delete removes both.
// post (not pre) so a song delete that fails (RESTRICT, ...) keeps its video. GridFS deletes are not transactional:
// ponytail: inside a transaction this runs before COMMIT, so an aborted commit would keep the song but lose its video (canvas_id then 404s)
export const gridfs = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db);
songSchema.post("findOneAndDelete", async function (doc) {
  if (doc?.canvas_id) await gridfs().delete(doc.canvas_id).catch(() => {}); // already gone = fine
});

// a cover URL typed by hand replaces the uploaded one, so drop the stored bytes
playlistSchema.pre("save", function () {
  if (this.isModified("image") && !this.image?.startsWith("/api/")) this.set({ cover: undefined, cover_type: undefined });
});

// registered after the triggers so before_song_delete clears Contains first
restrict(userSchema, "Playlist", "user_id");
restrict(artistSchema, "Songs", "artist_id");
restrict(artistSchema, "Album", "artist_id");
restrict(albumSchema, "Songs", "album_id");
restrict(genreSchema, "Songs", "genre_id");
restrict(playlistSchema, "Contains", "playlist_id");
restrict(playlistSchema, "Collaborators", "playlist_id");

export const User = model("User", userSchema);
export const Artist = model("Artist", artistSchema);
export const Genre = model("Genre", genreSchema);
export const Album = model("Album", albumSchema);
export const Songs = model("Songs", songSchema);
export const Playlist = model("Playlist", playlistSchema);
export const Contains = model("Contains", containsSchema);
export const RemovedSong = model("Removed_Songs", removedSchema);
export const Liked = model("Liked_Songs", likedSchema);
export const Follow = model("Follows", followSchema);
export const Collaborator = model("Collaborators", collabSchema);
export const Listen = model("Listens", listenSchema);

// generic CRUD: url segment == SQL table name
export const tables = { User, Artist, Genre, Album, Songs, Playlist, Contains, Removed_Songs: RemovedSong, Collaborators: Collaborator, Liked_Songs: Liked, Follows: Follow, Listens: Listen };

export const triggers = [
  ["before_song_insert", "BEFORE INSERT ON Songs", "SET NEW.song_name = UPPER(TRIM(NEW.song_name))"],
  ["before_user_insert", "BEFORE INSERT ON User", "SET NEW.email = LOWER(NEW.email)"],
  ["after_contains_delete", "AFTER DELETE ON Contains", "INSERT INTO Removed_Songs (playlist_id, song_id)"],
  ["before_song_delete", "BEFORE DELETE ON Songs", "DELETE FROM Contains, Liked_Songs, Listens WHERE song_id = OLD.song_id"],
  ["before_contains_insert", "BEFORE INSERT ON Contains", "SIGNAL 'playlist is full' when playlist has 50 songs; SET NEW.position = MAX(position) + 1"],
  ["before_follow_insert", "BEFORE INSERT ON Follows", "SIGNAL if target_id is missing in the table kind names, or a user follows themselves"],
  ["before_collab_insert", "BEFORE INSERT ON Collaborators", "SIGNAL if the user owns the playlist"],
  ["after_listen_insert", "AFTER INSERT ON Listens", "UPDATE Songs SET plays = plays + 1 WHERE song_id = NEW.song_id"],
  ["after_song_delete", "AFTER DELETE ON Songs", "delete its Canvas video from GridFS (fs.files + fs.chunks)"],
].map(([name, event, action]) => ({ name, event, action }));
