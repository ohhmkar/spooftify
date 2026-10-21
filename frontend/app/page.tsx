import { compact, art, type Song, type ArtistSummary, type PlaylistSummary, type AlbumDetails } from "@/lib/api";
import { api, getMe } from "@/lib/server";
import { Card, Shelf } from "@/components/ui";
import { PlayButton } from "@/components/Player";
import type { Stats } from "./stats/page";

const hours = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

export default async function Home() {
  const me = await getMe();
  const [trending, artists, playlists, newest, recent, stats] = await Promise.all([
    api<Song[]>("/views/Song_Details?_sort=plays&_limit=20"),
    api<ArtistSummary[]>("/views/Artist_Summary"),
    api<PlaylistSummary[]>("/views/Playlist_Summary?is_public=true"),
    api<AlbumDetails[]>("/views/Album_Details?_sort=release_year&_limit=30"),
    me ? api<Song[]>("/me/recent") : [],
    api<Stats>("/stats"),
  ]);
  const { totals: t } = stats;
  const inPlaylists = await api<Song[]>(`/songs-by-id?ids=${stats.most_in_playlists.map((x) => x.song_id)}`); // only the 10 shown, not the whole catalog
  const appearances = new Map(stats.top_artists.map((a) => [a.artist_id, a.playlists]));
  const popular = artists.toSorted((a, b) => (appearances.get(b.artist_id) ?? 0) - (appearances.get(a.artist_id) ?? 0) || (b.fans ?? 0) - (a.fans ?? 0)).slice(0, 30); // the full lists live behind "Show all"
  const albumOrArtist = (s: Song) => (s.album_id ? `/album/${s.album_id}` : `/artist/${s.artist_id}`);
  return (
    <div className="bg-gradient-to-b from-raised to-panel to-40% px-3 py-6">
      <p className="mb-6 px-3 text-sm text-muted">
        {t.songs} songs • {t.artists} artists • {t.public_playlists} public playlists • {hours(t.total_seconds)} of music • {compact(t.total_plays)} plays •{" "}
        <a href="/stats" className="text-white hover:underline">All stats</a>
      </p>
      {recent.length > 0 && (
        <Shelf title="Recently played">
          {recent.map((s, i) => (
            <Card key={s.song_id} href={albumOrArtist(s)} title={s.song_name} image={art(s)} subtitle={s.artist_name}
              action={<PlayButton songs={recent} index={i} />} />
          ))}
        </Shelf>
      )}
      <Shelf title="Trending songs">
        {trending.map((s, i) => (
          <Card key={s.song_id} href={albumOrArtist(s)} title={s.song_name} image={art(s)}
            subtitle={`${s.artist_name} • ${compact(s.plays ?? 0)} plays${s.yt_views != null ? ` • ${compact(s.yt_views)}` : ""}`}
            action={<PlayButton songs={trending} index={i} />} />
        ))}
      </Shelf>
      <Shelf title="Browse by genre">
        {stats.by_genre.map((g) => <Card key={g.genre_id} href={`/genre/${g.genre_id}`} title={g.genre_name} subtitle={`${g.songs} songs • ${compact(g.plays)} plays`} />)}
      </Shelf>
      <Shelf title="In the most public playlists">
        {inPlaylists.map((s, i) => (
          <Card key={s.song_id} href={albumOrArtist(s)} title={s.song_name} image={art(s)}
            subtitle={`${s.artist_name} • in ${stats.most_in_playlists[i].playlists} playlists`}
            action={<PlayButton songs={inPlaylists} index={i} />} />
        ))}
      </Shelf>
      <Shelf title="Popular artists" href="/search?type=artists">
        {popular.map((a) => (
          <Card key={a.artist_id} href={`/artist/${a.artist_id}`} title={a.artist_name} image={a.image} round
            subtitle={`Artist • ${a.song_count} songs${appearances.has(a.artist_id) ? ` • in ${appearances.get(a.artist_id)} playlists` : ""}`} />
        ))}
      </Shelf>
      <Shelf title="New albums" href="/search?type=albums">
        {newest.map((a) => <Card key={a.album_id} href={`/album/${a.album_id}`} title={a.album_name} image={a.cover} subtitle={`${a.release_year} • ${a.artist_name}`} />)}
      </Shelf>
      <Shelf title="Public playlists">
        {playlists.map((p) => (
          <Card key={p.playlist_id} href={`/playlist/${p.playlist_id}`} title={p.playlist_name} image={p.cover} subtitle={`By ${p.owner} • ${p.song_count} songs`} />
        ))}
      </Shelf>
    </div>
  );
}
