import { redirect } from "next/navigation";
import type { Song, Playlist } from "@/lib/api";
import { api, getMe } from "@/lib/server";
import { Hero } from "@/components/ui";
import { TrackList } from "@/components/TrackList";
import { PlayButton } from "@/components/Player";

export default async function Recent() {
  const me = await getMe();
  if (!me) redirect("/login");
  const [songs, mine] = await Promise.all([api<Song[]>("/me/recent?limit=50"), api<Playlist[]>("/me/playlists")]);
  return (
    <>
      <Hero kind="History" title="Recently Played" seed="Recently Played" meta={<><b>{me.user_name}</b> • your last {songs.length} different songs</>} />
      <div className="p-4">
        <PlayButton songs={songs} className="mb-4 ml-2 size-14" />
        <TrackList songs={songs} playlists={mine} />
      </div>
    </>
  );
}
