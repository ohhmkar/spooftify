import { notFound } from "next/navigation";
import type { Song, Playlist, ArtistSummary, Genre } from "@/lib/api";
import { api, getMe } from "@/lib/server";
import { Hero, Card, Shelf } from "@/components/ui";
import { TrackList } from "@/components/TrackList";
import { PlayButton } from "@/components/Player";

export default async function GenrePage({ params }: PageProps<"/genre/[id]">) {
  const { id } = await params;
  const me = await getMe();
  const [genre, songs, artists, mine] = await Promise.all([
    api<Genre>(`/Genre/${id}`).catch(() => null),
    api<Song[]>(`/views/Song_Details?genre_id=${id}`),
    api<ArtistSummary[]>("/views/Artist_Summary"),
    me ? api<Playlist[]>("/me/playlists") : [],
  ]);
  if (!genre) notFound();
  const ranked = songs.toSorted((a, b) => (b.plays ?? 0) - (a.plays ?? 0) || (b.yt_views ?? 0) - (a.yt_views ?? 0));
  const ids = new Set(songs.map((s) => s.artist_id));
  const here = artists.filter((a) => ids.has(a.artist_id));
  return (
    <>
      <Hero kind="Genre" title={genre.genre_name} seed={genre.genre_name} meta={<>{songs.length} songs • {here.length} artists</>} />
      <div className="p-4">
        <PlayButton songs={ranked} className="mb-4 ml-2 size-14" />
        <Shelf title="Artists">
          {here.map((a) => <Card key={a.artist_id} href={`/artist/${a.artist_id}`} title={a.artist_name} image={a.image} subtitle="Artist" round />)}
        </Shelf>
        <h2 className="mb-2 px-2 text-2xl font-bold">Most played</h2>
        <TrackList songs={ranked} playlists={mine} />
      </div>
    </>
  );
}
