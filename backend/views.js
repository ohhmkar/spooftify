// Native MongoDB views (db.createView) — read-only, recomputed on every query like SQL views.
const join = (from, localField, foreignField, as) => ({ $lookup: { from, localField, foreignField, as } });
const secToTime = (secs) => ({ $dateToString: { format: "%H:%M:%S", date: { $toDate: { $toLong: { $multiply: [secs, 1000] } } } } });

export const views = {
  // from the SQL: public user view [hides phone numbers and password_hashes]
  User_Public: {
    on: "User",
    pipeline: [{ $project: { _id: 0, user_id: "$_id", user_name: 1, email: 1 } }],
  },

  // from the SQL: sorts songs into length buckets
  Song_Length_Category: {
    on: "Songs",
    pipeline: [
      {
        $project: {
          _id: 0,
          song_name: 1,
          category: { $switch: { branches: [{ case: { $lt: ["$duration", 180] }, then: "Short" }, { case: { $lte: ["$duration", 300] }, then: "Medium" }], default: "Long" } },
        },
      },
    ],
  },

  // from the SQL: song count and total length per playlist (joins 4 tables)
  // extra columns vs SQL: user_id, is_public (the UI filters on them)
  Playlist_Summary: {
    on: "Playlist",
    pipeline: [
      join("User", "user_id", "_id", "u"),
      {
        $lookup: {
          from: "Contains",
          localField: "_id",
          foreignField: "playlist_id",
          pipeline: [{ $sort: { position: 1, _id: 1 } }, join("Songs", "song_id", "_id", "s"), { $project: { duration: { $first: "$s.duration" }, youtube_id: { $first: "$s.youtube_id" } } }],
          as: "c",
        },
      },
      {
        $project: {
          _id: 0,
          playlist_id: "$_id",
          playlist_name: 1,
          owner: { $first: "$u.user_name" },
          song_count: { $size: "$c" },
          total_length: secToTime({ $sum: "$c.duration" }),
          user_id: 1,
          is_public: 1,
          cover: { $ifNull: ["$image", { $let: { vars: { y: { $first: "$c.youtube_id" } }, in: { $cond: [{ $ifNull: ["$$y", false] }, { $concat: ["https://i.ytimg.com/vi/", "$$y", "/mqdefault.jpg"] }, "$$REMOVE"] } } }] },
        },
      },
      { $sort: { playlist_id: 1 } },
    ],
  },

  // UI views
  Song_Details: {
    on: "Songs",
    pipeline: [
      join("Artist", "artist_id", "_id", "a"),
      join("Album", "album_id", "_id", "al"),
      join("Genre", "genre_id", "_id", "g"),
      { $project: { _id: 0, song_id: "$_id", song_name: 1, duration: 1, audio_file: 1, album_id: 1, genre_id: 1, genre_name: { $first: "$g.genre_name" }, release_year: { $first: "$al.release_year" }, track_no: 1, album_name: { $first: "$al.album_name" }, album_cover: { $first: "$al.cover" }, plays: { $ifNull: ["$plays", 0] }, yt_views: 1, youtube_id: 1, artist_id: 1, artist_name: { $first: "$a.artist_name" }, country: { $first: "$a.country" } } },
      { $sort: { song_id: 1 } },
    ],
  },
  Album_Details: {
    on: "Album",
    pipeline: [
      join("Artist", "artist_id", "_id", "a"),
      join("Songs", "_id", "album_id", "s"),
      { $project: { _id: 0, album_id: "$_id", album_name: 1, artist_id: 1, artist_name: { $first: "$a.artist_name" }, release_year: 1, cover: 1, song_count: { $size: "$s" }, total_length: secToTime({ $sum: "$s.duration" }) } },
      { $sort: { release_year: -1, album_id: 1 } },
    ],
  },
  Artist_Summary: {
    on: "Artist",
    pipeline: [
      join("Songs", "_id", "artist_id", "s"),
      { $project: { _id: 0, artist_id: "$_id", artist_name: 1, country: 1, image: 1, bio: 1, bio_url: 1, fans: 1, plays: { $sum: "$s.plays" }, song_count: { $size: "$s" }, total_length: secToTime({ $sum: "$s.duration" }) } },
      { $sort: { song_count: -1, artist_id: 1 } },
    ],
  },
  Playlist_Tracks: {
    on: "Contains",
    pipeline: [
      join("Songs", "song_id", "_id", "s"),
      { $set: { s: { $first: "$s" } } },
      join("Artist", "s.artist_id", "_id", "a"),
      join("Album", "s.album_id", "_id", "al"),
      { $project: { playlist_id: 1, album_name: { $first: "$al.album_name" }, song_id: 1, song_name: "$s.song_name", duration: "$s.duration", plays: { $ifNull: ["$s.plays", 0] }, yt_views: "$s.yt_views", youtube_id: "$s.youtube_id", album_id: "$s.album_id", position: 1, artist_id: "$s.artist_id", artist_name: { $first: "$a.artist_name" } } },
      { $sort: { playlist_id: 1, position: 1, _id: 1 } },
    ],
  },
};

export async function createViews(db) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const [name, { on, pipeline }] of Object.entries(views)) {
    if (existing.has(name)) await db.dropCollection(name);
    await db.createCollection(name, { viewOn: on, pipeline });
  }
}
