import Link from "next/link";
import { getMe, getLibrary } from "@/lib/server";
import { Cover } from "./ui";
import { PlaylistDrop } from "./PlaylistDrop";

const row = "flex items-center gap-3 rounded-md p-2 hover:bg-white/[.07]";

// the library list: used in the desktop sidebar (text hides on narrow screens) and on /library for phones (wide = always show text)
export async function Library({ wide = false }: { wide?: boolean }) {
  const me = await getMe();
  const txt = wide ? "" : "max-lg:hidden";
  if (!me)
    return (
      <ul className="px-2">
        <li className={`m-2 rounded-lg bg-raised p-4 ${txt}`}>
          <p className="font-bold">Log in to build your library</p>
          <p className="mt-1 text-sm">Playlists, liked songs and follows live here.</p>
          <Link href="/login" className="mt-3 inline-block rounded-full bg-white px-4 py-2 text-sm font-bold text-black">Log in</Link>
        </li>
      </ul>
    );
  const lib = await getLibrary();
  const { playlists: mine, followedPlaylists, followedArtists } = lib ?? { playlists: [], followedPlaylists: [], followedArtists: [] };
  return (
    <ul className="px-2">
      {lib === null && <li className="p-4 text-sm text-muted">API offline — start the backend.</li>}
      {[
        ["/collection/tracks", "Liked Songs", "Playlist", <div key="l" className="grid aspect-square w-12 shrink-0 place-items-center rounded-md bg-gradient-to-br from-indigo-600 to-slate-300 text-xl">♥</div>],
        ["/recent", "Recently Played", "History", <div key="r" className="grid aspect-square w-12 shrink-0 place-items-center rounded-md bg-gradient-to-br from-emerald-600 to-slate-700 text-xl">⟲</div>],
      ].map(([href, title, sub, icon]) => (
        <li key={href as string}>
          <Link href={href as string} className={row}>
            {icon}
            <div className={`min-w-0 ${txt}`}><p className="font-medium">{title}</p><p className="text-sm text-muted">{sub}</p></div>
          </Link>
        </li>
      ))}
      {mine.map((p) => (
        <PlaylistDrop key={p.playlist_id} id={p.playlist_id} name={p.playlist_name}>
          <Link href={`/playlist/${p.playlist_id}`} className={row}>
            <Cover name={p.playlist_name} src={p.cover} className="w-12 shrink-0" />
            <div className={`min-w-0 ${txt}`}>
              <p className="truncate font-medium">{p.playlist_name}</p>
              <p className="text-sm text-muted">Playlist • {p.song_count} songs {p.shared ? `• Shared by ${p.owner}` : p.is_public ? "" : "• Private"}</p>
            </div>
          </Link>
        </PlaylistDrop>
      ))}
      {followedPlaylists.map((p) => (
        <li key={`fp${p.playlist_id}`}>
          <Link href={`/playlist/${p.playlist_id}`} className={row}>
            <Cover name={p.playlist_name} src={p.cover} className="w-12 shrink-0" />
            <div className={`min-w-0 ${txt}`}><p className="truncate font-medium">{p.playlist_name}</p><p className="text-sm text-muted">Playlist • {p.owner}</p></div>
          </Link>
        </li>
      ))}
      {followedArtists.map((a) => (
        <li key={`fa${a.artist_id}`}>
          <Link href={`/artist/${a.artist_id}`} className={row}>
            <Cover name={a.artist_name} src={a.image} round className="w-12 shrink-0" />
            <div className={`min-w-0 ${txt}`}><p className="truncate font-medium">{a.artist_name}</p><p className="text-sm text-muted">Artist</p></div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
