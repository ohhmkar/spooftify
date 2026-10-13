// Public statistics. Popularity = number of PUBLIC playlists containing a song; plays = streams started in the app.
const join = (from, localField, foreignField, as) => ({ $lookup: { from, localField, foreignField, as } });
const first = (as) => ({ $set: { [as]: { $first: `$${as}` } } });

// Contains rows that belong to a public playlist
const publicContains = [join("Playlist", "playlist_id", "_id", "p"), { $match: { "p.is_public": true } }];

export async function stats(db) {
  const c = (name) => db.collection(name);
  const songs = (sort, limit) => c("Song_Details").find({}, { projection: { _id: 0, audio_file: 0 } }).sort(sort).limit(limit).toArray();
  const [mostInPlaylists, mostPlayed, longest, shortest, avg, buckets, genres, removed, topArtists, mostSongs, byCountry, biggest, curators, totals] = await Promise.all([
    // a. most popular songs (public playlist appearances)
    c("Contains").aggregate([
      ...publicContains,
      { $group: { _id: "$song_id", playlists: { $sum: 1 } } },
      { $sort: { playlists: -1, _id: 1 } },
      { $limit: 10 },
      join("Song_Details", "_id", "song_id", "s"),
      first("s"),
      { $project: { _id: 0, song_id: "$_id", playlists: 1, song_name: "$s.song_name", artist_name: "$s.artist_name", plays: "$s.plays", yt_views: "$s.yt_views", youtube_id: "$s.youtube_id" } },
    ]).toArray(),
    // streams: most played in Spootify, with the YouTube view count next to it
    songs({ plays: -1, song_id: 1 }, 10),
    // b. longest / shortest
    songs({ duration: -1, song_id: 1 }, 5),
    songs({ duration: 1, song_id: 1 }, 5),
    // c. average length + Short/Medium/Long split (from the Song_Length_Category view)
    c("Songs").aggregate([{ $group: { _id: null, avg: { $avg: "$duration" } } }]).toArray(),
    c("Song_Length_Category").aggregate([{ $group: { _id: "$category", n: { $sum: 1 } } }]).toArray(),
    // songs per genre
    c("Song_Details").aggregate([{ $group: { _id: { id: "$genre_id", name: "$genre_name" }, songs: { $sum: 1 }, plays: { $sum: "$plays" } } }, { $sort: { songs: -1 } }, { $project: { _id: 0, genre_id: "$_id.id", genre_name: "$_id.name", songs: 1, plays: 1 } }]).toArray(),
    // d. recently removed songs (song may be deleted by now, hence the fallback name)
    c("Removed_Songs").aggregate([
      { $sort: { removed_at: -1 } },
      { $limit: 10 },
      join("Songs", "song_id", "_id", "s"),
      join("Playlist", "playlist_id", "_id", "p"),
      { $project: { _id: 0, removed_at: 1, song_id: 1, song_name: { $ifNull: [{ $first: "$s.song_name" }, "(deleted song)"] }, playlist_name: { $first: "$p.playlist_name" } } },
    ]).toArray(),
    // e. most popular artists (public playlist appearances across all their songs)
    c("Contains").aggregate([
      ...publicContains,
      join("Songs", "song_id", "_id", "s"),
      { $group: { _id: { $first: "$s.artist_id" }, playlists: { $sum: 1 } } },
      { $sort: { playlists: -1, _id: 1 } },
      { $limit: 10 },
      join("Artist", "_id", "_id", "a"),
      { $project: { _id: 0, artist_id: "$_id", playlists: 1, artist_name: { $first: "$a.artist_name" }, image: { $first: "$a.image" } } },
    ]).toArray(),
    // f. artists with the most songs
    c("Artist_Summary").find({}, { projection: { _id: 0 } }).sort({ song_count: -1, artist_id: 1 }).limit(10).toArray(),
    // g. artists and songs per country
    c("Artist").aggregate([
      join("Songs", "_id", "artist_id", "s"),
      { $group: { _id: "$country", artists: { $sum: 1 }, songs: { $sum: { $size: "$s" } } } },
      { $sort: { songs: -1, _id: 1 } },
      { $project: { _id: 0, country: "$_id", artists: 1, songs: 1 } },
    ]).toArray(),
    // h. biggest public playlists
    c("Playlist_Summary").find({ is_public: true }, { projection: { _id: 0, user_id: 0 } }).sort({ song_count: -1, playlist_id: 1 }).limit(10).toArray(),
    // i. top curators, names via User_Public so emails never leave the DB
    c("Playlist").aggregate([
      { $match: { is_public: true } },
      { $group: { _id: "$user_id", playlists: { $sum: 1 } } },
      { $sort: { playlists: -1, _id: 1 } },
      { $limit: 10 },
      join("User_Public", "_id", "user_id", "u"),
      { $project: { _id: 0, user_id: "$_id", playlists: 1, user_name: { $first: "$u.user_name" } } },
    ]).toArray(),
    // j. headline counters
    Promise.all([
      c("User").countDocuments(), c("Artist").countDocuments(), c("Songs").countDocuments(), c("Playlist").countDocuments({ is_public: true }),
      c("Songs").aggregate([{ $group: { _id: null, secs: { $sum: "$duration" }, plays: { $sum: { $ifNull: ["$plays", 0] } } } }]).toArray(),
    ]),
  ]);
  const [users, artists, songCount, publicPlaylists, [sum]] = totals;
  return {
    totals: { users, artists, songs: songCount, public_playlists: publicPlaylists, total_seconds: sum?.secs ?? 0, total_plays: sum?.plays ?? 0 },
    most_in_playlists: mostInPlaylists,
    most_played: mostPlayed,
    longest,
    shortest,
    avg_duration: Math.round(avg[0]?.avg ?? 0),
    by_genre: genres,
    length_split: Object.fromEntries(buckets.map((b) => [b._id, b.n])),
    recently_removed: removed,
    top_artists: topArtists,
    artists_most_songs: mostSongs,
    by_country: byCountry,
    biggest_playlists: biggest,
    top_curators: curators,
  };
}
