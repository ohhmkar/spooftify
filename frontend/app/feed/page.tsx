import Link from "next/link";
import { art, type Song, type AlbumDetails } from "@/lib/api";
import { api, getMe } from "@/lib/server";
import { Card, Cover, Shelf } from "@/components/ui";
import { PlayButton } from "@/components/Player";

type Person = { user_id: number; user_name: string; photo?: string };
type Event =
  | { type: "like"; at: string; user: Person; song: Song }
  | { type: "follow"; at: string; user: Person; kind: "artist" | "user" | "playlist"; target_id: number; target_name: string }
  | { type: "add"; at: string; playlist: { playlist_id: number; playlist_name: string }; song: Song };
type Feed = { now: string; following: { users: number; artists: number; playlists: number }; events: Event[]; releases: AlbumDetails[] };

const ago = (iso: string, now: number) => {
  const m = Math.round((now - +new Date(iso)) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const href = { artist: "/artist/", user: "/user/", playlist: "/playlist/" };

export default async function FeedPage() {
  const me = await getMe();
  if (!me) return <p className="px-6 py-10 text-muted"><Link href="/login" className="text-white underline">Log in</Link> to see what the people you follow are listening to.</p>;
  const feed = await api<Feed>("/me/feed");
  const now = +new Date(feed.now); // the API's clock: "5 min ago" needs no clock read during render
  const nothing = !feed.following.users && !feed.following.playlists && !feed.following.artists;
  const songs = feed.events.flatMap((e) => ("song" in e ? [e.song] : [])); // the PlayButton plays the feed from that song on
  const link = "font-bold hover:underline";
  return (
    <div className="px-3 py-6">
      <h1 className="mb-6 px-3 text-3xl font-bold">Feed</h1>
      {nothing && <p className="px-3 text-muted">Follow people, playlists and artists, and what they do shows up here. Try the <Link href="/search?type=playlists" className="text-white underline">public playlists</Link>.</p>}
      {feed.releases.length > 0 && (
        <Shelf title="Latest from artists you follow">
          {feed.releases.map((a) => <Card key={a.album_id} href={`/album/${a.album_id}`} title={a.album_name} image={a.cover} subtitle={`${a.release_year} • ${a.artist_name}`} />)}
        </Shelf>
      )}
      {!nothing && !feed.events.length && <p className="px-3 text-muted">Nothing new from the people and playlists you follow yet.</p>}
      <ol className="max-w-3xl space-y-1 px-1">
        {feed.events.map((e, i) => {
          const who = e.type === "add"
            ? <>Added to <Link href={`/playlist/${e.playlist.playlist_id}`} className={link}>{e.playlist.playlist_name}</Link></>
            : <><Link href={`/user/${e.user.user_id}`} className={link}>{e.user.user_name}</Link> {e.type === "like" ? "liked" : "followed"}{" "}
              {e.type === "follow" && <Link href={`${href[e.kind]}${e.target_id}`} className={link}>{e.target_name}</Link>}</>;
          return (
            <li key={i} className="group flex items-center gap-3 rounded-md p-2 hover:bg-white/[.07]">
              {e.type === "add" ? <Cover name={e.playlist.playlist_name} className="w-10 shrink-0" />
                : <Cover name={e.user.user_name} src={e.user.photo} round className="w-10 shrink-0" />}
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate">{who}</p>
                {"song" in e && <p className="truncate text-muted">{e.song.song_name} · <Link href={`/artist/${e.song.artist_id}`} className="hover:text-white hover:underline">{e.song.artist_name}</Link></p>}
                <p className="text-xs text-muted">{ago(e.at, now)}</p>
              </div>
              {"song" in e && (
                <>
                  <Cover name={e.song.song_name} src={art(e.song)} className="w-10 shrink-0" />
                  <PlayButton songs={songs} index={songs.indexOf(e.song)} className="size-9 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
