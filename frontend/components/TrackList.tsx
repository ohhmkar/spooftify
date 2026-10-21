"use client";
import Link from "next/link";
import { send, mmss, art, compact, SONG_DRAG, type Song, type Playlist } from "@/lib/api";
import { usePlayer } from "./Player";
import { LikeButton, useLoggedIn } from "./Likes";
import { Cover } from "./ui";
import { useToast } from "./Toast";
import { useAction } from "./useAction";

type Action = { label: string; short?: string; run?: () => void; href?: string; wide?: boolean; menu?: boolean };

// editPlaylist: the playlist these rows belong to when the viewer may edit it (owner or collaborator): enables Remove and the move buttons
export function TrackList({ songs, playlists, editPlaylist }: { songs: Song[]; playlists: Playlist[]; editPlaylist?: number }) {
  const { current, playing, play, addToQueue, playNext } = usePlayer();
  const toast = useToast();
  const run = useAction();
  const loggedIn = useLoggedIn();
  const addTo = (s: Song, id: string) => run(send("POST", `/playlists/${id}/songs`, { song_id: s.song_id }), `Added “${s.song_name}” to ${playlists.find((p) => String(p._id) === id)?.playlist_name}`);
  const move = (i: number, by: number) => {
    const ids = songs.map((s) => s.song_id);
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    run(send("PUT", `/playlists/${editPlaylist}/order`, { song_ids: ids }));
  };
  // one list feeds both the ⋯ menu and the row's hover buttons (wide screens). menu: only in the ⋯ menu; wide: only on hover
  const actions = (s: Song, i: number): Action[] => [
    { label: "Play next", run: () => (playNext(s), toast(`Playing “${s.song_name}” next`)) },
    { label: "Add to queue", short: "Queue", run: () => (addToQueue(s), toast(`Added “${s.song_name}” to the queue`)) },
    { label: "Go to artist", href: `/artist/${s.artist_id}`, menu: true },
    ...(s.album_id ? [{ label: "Go to album", href: `/album/${s.album_id}`, menu: true }] : []),
    ...(editPlaylist ? [
      { label: "Move up", short: "↑", run: i > 0 ? () => move(i, -1) : undefined, wide: true },
      { label: "Move down", short: "↓", run: i < songs.length - 1 ? () => move(i, 1) : undefined, wide: true },
      { label: "Remove", run: () => run(send("DELETE", `/playlists/${editPlaylist}/songs/${s.song_id}`), "Removed from playlist") },
    ] : []),
  ];
  // "+ Add to…" picker: only for logged-in users, and says so when there is nothing to pick yet
  const addSelect = (s: Song, cls: string) =>
    loggedIn && (
      <select aria-label={`Add ${s.song_name} to playlist`} className={cls} value="" onChange={(e) => { closeMenu(e.target); addTo(s, e.target.value); }}>
        <option value="" disabled>{playlists.length ? "+ Add to…" : "No playlists yet"}</option>
        {playlists.map((p) => <option key={p._id} value={p._id}>{p.playlist_name}{p.shared ? " (shared)" : ""}</option>)}
      </select>
    );
  const touch = () => matchMedia("(hover: none)").matches; // phones have no hover, so a tap on the row has to play it
  const closeMenu = (el: HTMLElement) => el.closest("details")?.removeAttribute("open"); // the ⋯ menu
  const small = "whitespace-nowrap rounded px-2 py-1 text-xs text-muted hover:bg-white/10 hover:text-white disabled:opacity-30";
  const item = (a: Action, short: boolean) => {
    const text = short ? (a.short ?? a.label) : a.label;
    return a.href
      ? <Link key={a.label} className={small} href={a.href}>{text}</Link>
      : <button key={a.label} aria-label={short && a.short ? a.label : undefined} disabled={!a.run} className={small} onClick={a.run}>{text}</button>;
  };

  if (!songs.length) return <p className="px-6 py-8 text-muted">No songs here yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-white/10 text-left text-muted">
        <tr>
          <th className="w-12 min-w-12 py-2 text-center font-normal">#</th>
          <th className="w-[42%] font-normal max-md:w-auto">Title</th>
          <th className="w-[22%] font-normal max-lg:hidden">Album</th>
          <th title="Spooftify plays · YouTube views" className="w-40 whitespace-nowrap text-right font-normal max-md:hidden">Plays · Views</th>
          <th className="w-10" />
          <th className="w-16 text-right font-normal">⏱</th>
          <th className="w-10" />
          <th className="w-72 max-xl:hidden" />
        </tr>
      </thead>
      <tbody>
        {songs.map((s, i) => {
          const now = current?.song_id === s.song_id;
          const acts = actions(s, i);
          return (
          // draggable: drop it on a playlist in the sidebar to add it there
          <tr key={s._id ?? s.song_id} className="group hover:bg-white/[.07]" onDoubleClick={() => play(songs, i)}
            draggable={loggedIn} onDragStart={(e) => { e.dataTransfer.setData(SONG_DRAG, JSON.stringify({ song_id: s.song_id, song_name: s.song_name })); e.dataTransfer.effectAllowed = "copy"; }}
            onClick={(e) => touch() && !(e.target as HTMLElement).closest("a, button, select, summary, details") && play(songs, i)}>
            <td className="rounded-l-md py-2 text-center text-muted">
              <span className={`group-hover:hidden group-focus-within:hidden ${now ? "text-accent" : ""}`}>{now && playing ? "♪" : i + 1}</span>
              {/* sr-only until hover / keyboard focus, so Tab can reach it */}
              <button aria-label={`${now && playing ? "Pause" : "Play"} ${s.song_name}`} onClick={() => play(songs, i)} className="sr-only w-full text-white group-hover:not-sr-only group-focus-within:not-sr-only">{now && playing ? "❚❚" : "▶"}</button>
            </td>
            <td className="flex min-w-0 items-center gap-3 py-1">
              {/* clicking the cover plays too; the number cell holds the keyboard-reachable button */}
              <button tabIndex={-1} aria-hidden onClick={() => play(songs, i)} className="group/cover relative shrink-0">
                <Cover name={s.song_name} src={art(s)} className="w-10" />
                <span className="absolute inset-0 hidden place-items-center rounded-md bg-black/50 text-white group-hover/cover:grid">{now && playing ? "❚❚" : "▶"}</span>
              </button>
              <div className="min-w-0">
                <p className={`line-clamp-1 font-medium ${now ? "text-accent" : "text-white"}`}>{s.song_name}</p>
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
            <td className="w-10 text-center">
              <details className="relative">
                <summary aria-label={`More options for ${s.song_name}`} className="cursor-pointer list-none px-2 py-1 text-muted hover:text-white">⋯</summary>
                <div className="absolute right-0 z-20 mt-1 flex w-44 flex-col gap-1 rounded-lg bg-raised p-2 text-left shadow-xl shadow-black/60" onClick={(e) => (e.target as HTMLElement).closest("button, a") && closeMenu(e.target as HTMLElement)}>
                  {acts.filter((a) => !a.wide).map((a) => item(a, false))}
                  {addSelect(s, "rounded bg-white/10 px-2 py-1 text-xs")}
                </div>
              </details>
            </td>
            <td className="rounded-r-md pr-3 text-right max-xl:hidden">
              <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                {acts.filter((a) => !a.menu).slice(0, 2).map((a) => item(a, true))}
                {addSelect(s, "max-w-28 rounded bg-white/10 px-2 py-1 text-xs")}
                {acts.filter((a) => !a.menu).slice(2).map((a) => item(a, true))}
              </div>
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
  );
}
