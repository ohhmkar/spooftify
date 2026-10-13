import { redirect } from "next/navigation";
import type { Song, Playlist } from "@/lib/api";
import { api, getMe } from "@/lib/server";
import { Hero } from "@/components/ui";
import { TrackList } from "@/components/TrackList";
import { PlayButton } from "@/components/Player";

export default async function Liked() {
  const me = await getMe();
  if (!me) redirect("/login");
  const [songs, mine] = await Promise.all([api<Song[]>("/me/liked"), api<Playlist[]>("/me/playlists")]);
  return (
    <>
      <Hero kind="Playlist" title="Liked Songs" seed="Liked Songs" meta={<><b>{me.user_name}</b> • {songs.length} songs</>} />
      <div className="p-4">
        <PlayButton songs={songs} className="mb-4 ml-2 size-14" />
        <TrackList songs={songs} playlists={mine} />
      </div>
    </>
  );
}
