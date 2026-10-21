import Link from "next/link";
import { notFound } from "next/navigation";
import type { AlbumDetails, Song, Playlist } from "@/lib/api";
import { api, getMe } from "@/lib/server";
import { Hero } from "@/components/ui";
import { TrackList } from "@/components/TrackList";
import { PlayButton } from "@/components/Player";
import { ShareButton } from "@/components/ShareButton";

export default async function AlbumPage({ params }: PageProps<"/album/[id]">) {
  const { id } = await params;
  const me = await getMe();
  const [[album], songs, mine] = await Promise.all([
    api<AlbumDetails[]>(`/views/Album_Details?album_id=${id}`),
    api<Song[]>(`/views/Song_Details?album_id=${id}`),
    me ? api<Playlist[]>("/me/playlists") : [],
  ]);
  if (!album) notFound();
  const ordered = songs.toSorted((a, b) => (a.track_no ?? 0) - (b.track_no ?? 0));
  return (
    <>
      <Hero kind="Album" title={album.album_name} seed={album.album_name} image={album.cover}
        meta={<><Link href={`/artist/${album.artist_id}`} className="font-bold hover:underline">{album.artist_name}</Link> • {album.release_year} • {album.song_count} songs, {album.total_length}</>} />
      <div className="p-4">
        <div className="mb-4 flex items-center gap-4 pl-2">
          <PlayButton songs={ordered} className="size-14" />
          <ShareButton title={album.album_name} />
        </div>
        <TrackList songs={ordered} playlists={mine} />
      </div>
    </>
  );
}
