"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { send, mmss, thumb, compact, type Song, type Playlist } from "@/lib/api";
import { usePlayer } from "./Player";
import { LikeButton } from "./Likes";
import { Cover } from "./ui";

// editPlaylist: the playlist these rows belong to when the viewer may edit it (owner or collaborator): enables Remove and the move buttons
export function TrackList({ songs, playlists, editPlaylist }: { songs: Song[]; playlists: Playlist[]; editPlaylist?: number }) {
  const router = useRouter();
  const { current, play, addToQueue, playNext } = usePlayer();
  const run = (p: Promise<unknown>) => p.then(() => router.refresh()).catch((e) => alert(e.message));
  const move = (i: number, by: number) => {
    const ids = songs.map((s) => s.song_id);
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    run(send("PUT", `/playlists/${editPlaylist}/order`, { song_ids: ids }));
  };
  const small = "rounded px-2 py-1 text-xs text-muted hover:bg-white/10 hover:text-white";

  if (!songs.length) return <p className="px-6 py-8 text-muted">No songs here yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-white/10 text-left text-muted">
        <tr>
          <th className="w-12 py-2 text-center font-normal">#</th>
          <th className="font-normal">Title</th>
          <th className="font-normal max-lg:hidden">Album</th>
          <th className="w-40 text-right font-normal max-md:hidden">Plays · YouTube</th>
          <th className="w-10" />
          <th className="w-16 text-right font-normal">⏱</th>
          <th className="w-10 xl:hidden" />
          <th className="w-72 max-xl:hidden" />
        </tr>
      </thead>
      <tbody>
        {songs.map((s, i) => (
          <tr key={s._id ?? s.song_id} className="group hover:bg-white/[.07]" onDoubleClick={() => play(songs, i)}>
            <td className="rounded-l-md py-2 text-center text-muted">
              <span className="group-hover:hidden">{i + 1}</span>
              <button aria-label={`Play ${s.song_name}`} onClick={() => play(songs, i)} className="hidden w-full text-white group-hover:block">▶</button>
            </td>
            <td className="flex items-center gap-3 py-1">
              <Cover name={s.song_name} src={thumb(s.youtube_id)} className="w-10 shrink-0" />
              <div className="min-w-0">
                <p className={`font-medium ${current?.song_id === s.song_id ? "text-accent" : "text-white"}`}>{s.song_name}</p>
                <Link href={`/artist/${s.artist_id}`} className="text-muted hover:text-white hover:underline">{s.artist_name}</Link>
              </div>
            </td>
            <td className="max-lg:hidden">
              {s.album_id && <Link href={`/album/${s.album_id}`} className="line-clamp-1 text-muted hover:text-white hover:underline">{s.album_name}</Link>}
            </td>
            <td className="text-right text-muted tabular-nums max-md:hidden">
              {compact(s.plays ?? 0)} · {s.yt_views != null ? compact(s.yt_views) : "–"}
            </td>
            <td>
              <LikeButton id={s.song_id} />
            </td>
            <td className="text-right text-muted tabular-nums">{mmss(s.duration)}</td>
            <td className="w-10 text-center xl:hidden">
              <details className="relative">
                <summary aria-label={`More options for ${s.song_name}`} className="cursor-pointer list-none px-2 py-1 text-muted hover:text-white">⋯</summary>
                <div className="absolute right-0 z-20 mt-1 flex w-44 flex-col gap-1 rounded-lg bg-raised p-2 text-left shadow-xl shadow-black/60">
                  <button className={small} onClick={() => playNext(s)}>Play next</button>
                  <button className={small} onClick={() => addToQueue(s)}>Add to queue</button>
                  <select aria-label={`Add ${s.song_name} to playlist`} className="rounded bg-white/10 px-2 py-1 text-xs" value="" onChange={(e) => run(send("POST", `/playlists/${e.target.value}/songs`, { song_id: s.song_id }))}>
                    <option value="" disabled>+ Add to…</option>
                    {playlists.map((p) => <option key={p._id} value={p._id}>{p.playlist_name}</option>)}
                  </select>
                  {editPlaylist && <button className={small} onClick={() => run(send("DELETE", `/playlists/${editPlaylist}/songs/${s.song_id}`))}>Remove</button>}
                </div>
              </details>
            </td>
            <td className="rounded-r-md pr-3 text-right max-xl:hidden">
              <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <button className={small} onClick={() => playNext(s)}>Play next</button>
                <button className={small} onClick={() => addToQueue(s)}>Queue</button>
                <select
                  aria-label={`Add ${s.song_name} to playlist`}
                  className="max-w-28 rounded bg-white/10 px-2 py-1 text-xs"
                  value=""
                  onChange={(e) => run(send("POST", `/playlists/${e.target.value}/songs`, { song_id: s.song_id }))}
                >
                  <option value="" disabled>+ Add to…</option>
                  {playlists.map((p) => (
                    <option key={p._id} value={p._id}>{p.playlist_name}{p.shared ? " (shared)" : ""}</option>
                  ))}
                </select>
                {editPlaylist && (
                  <>
                    <button aria-label="Move up" disabled={i === 0} className={`${small} disabled:opacity-30`} onClick={() => move(i, -1)}>↑</button>
                    <button aria-label="Move down" disabled={i === songs.length - 1} className={`${small} disabled:opacity-30`} onClick={() => move(i, 1)}>↓</button>
                  </>
                )}
                {editPlaylist && <button className={small} onClick={() => run(send("DELETE", `/playlists/${editPlaylist}/songs/${s.song_id}`))}>Remove</button>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
