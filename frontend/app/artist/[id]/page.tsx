import Link from "next/link";
import { notFound } from "next/navigation";
import { compact, type ArtistSummary, type Song, type Playlist, type AlbumDetails, type Follow } from "@/lib/api";
import { api, getMe } from "@/lib/server";
import { Hero, Card, Shelf } from "@/components/ui";
import { TrackList } from "@/components/TrackList";
import { PlayButton } from "@/components/Player";
import { FollowButton } from "@/components/Auth";

export default async function ArtistPage({ params }: PageProps<"/artist/[id]">) {
  const { id } = await params;
  const me = await getMe();
  const [[artist], songs, albums, stats, mine, follows] = await Promise.all([
    api<ArtistSummary[]>(`/views/Artist_Summary?artist_id=${id}`),
    api<Song[]>(`/views/Song_Details?artist_id=${id}`),
    api<AlbumDetails[]>(`/views/Album_Details?artist_id=${id}`),
    api<{ monthly_listeners: number; followers: number }>(`/artists/${id}/stats`),
    me ? api<Playlist[]>("/me/playlists") : [],
    me ? api<Follow[]>("/me/follows") : [],
  ]);
  if (!artist) notFound();
  const popular = songs.toSorted((a, b) => (b.plays ?? 0) - (a.plays ?? 0) || (b.yt_views ?? 0) - (a.yt_views ?? 0)).slice(0, 5);
  const following = follows.some((f) => f.kind === "artist" && f.target_id === artist.artist_id);
  return (
    <>
      <Hero kind="Artist" title={artist.artist_name} seed={artist.artist_name} image={artist.image} round
        meta={<>
          <b>{compact(stats.monthly_listeners)}</b> monthly listeners • <b>{compact(stats.followers)}</b> followers • {compact(artist.fans ?? 0)} fans on Deezer
          <br />{artist.country} • {artist.song_count} songs, {artist.total_length} • {compact(artist.plays ?? 0)} plays
        </>} />
      <div className="p-4">
        <div className="mb-4 flex items-center gap-4 pl-2">
          <PlayButton songs={popular} className="size-14" />
          <FollowButton kind="artist" id={artist.artist_id} following={following} loggedIn={!!me} />
        </div>
        <h2 className="mb-2 px-2 text-2xl font-bold">Popular</h2>
        <TrackList songs={popular} playlists={mine} />
        {albums.length > 0 && (
          <div className="mt-8">
            <Shelf title="Discography">
              {albums.map((a) => <Card key={a.album_id} href={`/album/${a.album_id}`} title={a.album_name} image={a.cover} subtitle={`${a.release_year} • ${a.song_count} songs`} />)}
            </Shelf>
          </div>
        )}
        {songs.length > popular.length && (
          <>
            <h2 className="mt-4 mb-2 px-2 text-2xl font-bold">All songs</h2>
            <TrackList songs={songs} playlists={mine} />
          </>
        )}
        {artist.bio && (
          <section className="mt-8 max-w-2xl rounded-lg bg-raised p-5">
            <h2 className="mb-2 text-2xl font-bold">About</h2>
            <p className="leading-relaxed text-white/80">{artist.bio}</p>
            {artist.bio_url && <Link href={artist.bio_url} className="mt-3 inline-block text-sm text-muted hover:text-white hover:underline">Source: Wikipedia</Link>}
          </section>
        )}
      </div>
    </>
  );
}
