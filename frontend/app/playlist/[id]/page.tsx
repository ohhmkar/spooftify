import Link from "next/link";
import { notFound } from "next/navigation";
import type { PlaylistSummary, Song, Playlist, Follow } from "@/lib/api";
import { api, getMe } from "@/lib/server";
import { Hero } from "@/components/ui";
import { TrackList } from "@/components/TrackList";
import { PlayButton, ShuffleButton } from "@/components/Player";
import { PlaylistActions } from "@/components/PlaylistActions";
import { FollowButton } from "@/components/Auth";

export default async function PlaylistPage({ params }: PageProps<"/playlist/[id]">) {
  const { id } = await params;
  const me = await getMe();
  const [[p], tracks, mine, follows, followers, collaborators] = await Promise.all([
    api<PlaylistSummary[]>(`/views/Playlist_Summary?playlist_id=${id}`),
    api<Song[]>(`/views/Playlist_Tracks?playlist_id=${id}`),
    me ? api<Playlist[]>("/me/playlists") : [],
    me ? api<Follow[]>("/me/follows") : [],
    api<Follow[]>(`/Follows?kind=playlist&target_id=${id}`),
    api<{ user_id: number; user_name: string }[]>(`/playlists/${id}/collaborators`),
  ]);
  if (!p) notFound();
  const own = p.user_id === me?.user_id;
  const canEdit = own || collaborators.some((c) => c.user_id === me?.user_id);
  if (!p.is_public && !canEdit) notFound(); // private playlists are only visible to their owner and collaborators
  return (
    <>
      <Hero kind={p.is_public ? "Public Playlist" : "Private Playlist"} title={p.playlist_name} seed={p.playlist_name} image={p.cover}
        meta={<><Link href={`/user/${p.user_id}`} className="font-bold hover:underline">{p.owner}</Link>{collaborators.length > 0 && <> with {collaborators.map((c) => c.user_name).join(", ")}</>} • {followers.length} followers • {p.song_count} songs, {p.total_length}</>} />
      {own && <PlaylistActions p={p} collaborators={collaborators} />}
      {canEdit && !own && <p className="px-6 py-4 text-sm text-muted">You are a collaborator: you can add, remove and reorder songs here.</p>}
      <div className="p-4">
        <div className="mb-4 flex items-center gap-4 pl-2">
          <PlayButton songs={tracks} className="size-14" />
          <ShuffleButton songs={tracks} />
          {!own && <FollowButton kind="playlist" id={p.playlist_id} loggedIn={!!me} following={follows.some((f) => f.kind === "playlist" && f.target_id === p.playlist_id)} />}
        </div>
        <TrackList songs={tracks} playlists={mine} editPlaylist={canEdit ? p.playlist_id : undefined} />
      </div>
    </>
  );
}
