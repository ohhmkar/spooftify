import { notFound } from "next/navigation";
import type { PlaylistSummary, Follow } from "@/lib/api";
import { api, getMe } from "@/lib/server";
import { Hero, Card, Shelf } from "@/components/ui";
import { FollowButton } from "@/components/Auth";
import { UploadButton } from "@/components/Upload";
import { ShareButton } from "@/components/ShareButton";

type PublicUser = { user_id: number; user_name: string; photo?: string };

export default async function UserPage({ params }: PageProps<"/user/[id]">) {
  const { id } = await params;
  const me = await getMe();
  const [[user], playlists, followers, following, mine] = await Promise.all([
    api<PublicUser[]>(`/views/User_Public?user_id=${id}`),
    api<PlaylistSummary[]>(`/views/Playlist_Summary?user_id=${id}`),
    api<Follow[]>(`/Follows?kind=user&target_id=${id}`),
    api<Follow[]>(`/Follows?user_id=${id}`),
    me ? api<Follow[]>("/me/follows") : [],
  ]);
  if (!user) notFound();
  const own = me?.user_id === user.user_id;
  const shown = playlists.filter((p) => p.is_public || own);
  return (
    <>
      <Hero kind="Profile" title={user.user_name} seed={user.user_name} image={user.photo} round
        meta={<>{shown.length} playlists • {followers.length} followers • {following.length} following</>} />
      <div className="p-4">
        <div className="mb-4 flex items-center gap-4 pl-2">
          {own ? <UploadButton path="/me/photo" accept="image/*" label={user.photo ? "Change photo" : "Upload photo"} />
            : <FollowButton kind="user" id={user.user_id} loggedIn={!!me} following={mine.some((f) => f.kind === "user" && f.target_id === user.user_id)} />}
          <ShareButton title={user.user_name} />
        </div>
        <Shelf title={own ? "Your playlists" : "Public playlists"}>
          {shown.map((p) => <Card key={p.playlist_id} href={`/playlist/${p.playlist_id}`} title={p.playlist_name} image={p.cover} subtitle={`${p.song_count} songs${p.is_public ? "" : " • Private"}`} />)}
        </Shelf>
      </div>
    </>
  );
}
