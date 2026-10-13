import Link from "next/link";
import { mmss, thumb } from "@/lib/api";
import { api } from "@/lib/server";
import { Cover } from "@/components/ui";

export type Stats = {
  totals: { users: number; artists: number; songs: number; public_playlists: number; total_seconds: number; total_plays: number };
  most_in_playlists: { song_id: number; song_name: string; artist_name: string; playlists: number; youtube_id?: string }[];
  most_played: { song_id: number; song_name: string; artist_name: string; plays: number; yt_views?: number; youtube_id?: string }[];
  longest: { song_id: number; song_name: string; artist_name: string; duration: number }[];
  shortest: { song_id: number; song_name: string; artist_name: string; duration: number }[];
  avg_duration: number;
  length_split: Record<string, number>;
  by_genre: { genre_id: number; genre_name: string; songs: number; plays: number }[];
  recently_removed: { song_name: string; playlist_name: string; removed_at: string }[];
  top_artists: { artist_id: number; artist_name: string; playlists: number; image?: string }[];
  artists_most_songs: { artist_id: number; artist_name: string; song_count: number; image?: string }[];
  by_country: { country: string; artists: number; songs: number }[];
  biggest_playlists: { playlist_id: number; playlist_name: string; owner: string; song_count: number }[];
  top_curators: { user_id: number; user_name: string; playlists: number }[];
};

const n = (x: number) => x.toLocaleString("en-IN");

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-raised p-4">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

// ranked list: left = label (optionally a link), right = the number
function Rank({ rows }: { rows: { key: string | number; img?: string; round?: boolean; label: string; sub?: string; href?: string; value: string }[] }) {
  if (!rows.length) return <p className="text-sm text-muted">Nothing yet.</p>;
  return (
    <ol className="space-y-1">
      {rows.map((r, i) => (
        <li key={r.key} className="flex items-baseline gap-3">
          <span className="w-5 text-right text-muted tabular-nums">{i + 1}</span>
          {r.img !== undefined && <Cover name={r.label} src={r.img || undefined} round={r.round} className="w-9 shrink-0" />}
          <div className="min-w-0 flex-1">
            {r.href ? <Link href={r.href} className="block truncate hover:underline">{r.label}</Link> : <p className="truncate">{r.label}</p>}
            {r.sub && <p className="truncate text-sm text-muted">{r.sub}</p>}
          </div>
          <span className="text-sm text-muted tabular-nums">{r.value}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function Stats() {
  const s = await api<Stats>("/stats");
  const { totals: t } = s;
  const counters = [
    ["Users", n(t.users)], ["Artists", n(t.artists)], ["Songs", n(t.songs)], ["Public playlists", n(t.public_playlists)],
    ["Listening time", `${Math.floor(t.total_seconds / 3600)}h ${Math.floor((t.total_seconds % 3600) / 60)}m`], ["Total plays", n(t.total_plays)],
  ];
  const maxSongs = Math.max(1, ...s.by_country.map((c) => c.songs));
  const split = ["Short", "Medium", "Long"];
  const song = (x: { song_id: number; artist_name: string; youtube_id?: string }) => ({ key: x.song_id, sub: x.artist_name, img: thumb(x.youtube_id) ?? "" });
  return (
    <div className="px-6 py-8">
      <h1 className="mb-6 text-5xl font-black tracking-tight">Spooftify stats</h1>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {counters.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-raised p-4">
            <p className="text-3xl font-black tabular-nums">{v}</p>
            <p className="text-sm text-muted">{k}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Box title="Most played songs">
          <Rank rows={s.most_played.map((x) => ({ ...song(x), label: x.song_name, value: `${n(x.plays)} plays${x.yt_views != null ? ` · ${n(x.yt_views)} YouTube views` : ""}` }))} />
        </Box>
        <Box title="Most popular songs (public playlists)">
          <Rank rows={s.most_in_playlists.map((x) => ({ ...song(x), label: x.song_name, value: `${x.playlists} playlists` }))} />
        </Box>
        <Box title="Longest songs">
          <Rank rows={s.longest.map((x) => ({ ...song(x), label: x.song_name, value: mmss(x.duration) }))} />
        </Box>
        <Box title="Shortest songs">
          <Rank rows={s.shortest.map((x) => ({ ...song(x), label: x.song_name, value: mmss(x.duration) }))} />
        </Box>
        <Box title="Average song length">
          <p className="text-4xl font-black tabular-nums">{mmss(s.avg_duration)}</p>
          <div className="mt-3 flex gap-6 text-sm text-muted">
            {split.map((k) => <span key={k}>{k}: <b className="text-white">{s.length_split[k] ?? 0}</b></span>)}
          </div>
        </Box>
        <Box title="Recently removed from playlists">
          <Rank rows={s.recently_removed.map((x, i) => ({ key: i, label: x.song_name, sub: `from ${x.playlist_name ?? "a deleted playlist"}`, value: new Date(x.removed_at).toLocaleDateString("en-IN") }))} />
        </Box>
        <Box title="Most popular artists">
          <Rank rows={s.top_artists.map((x) => ({ key: x.artist_id, img: x.image ?? "", round: true, label: x.artist_name, href: `/artist/${x.artist_id}`, value: `${x.playlists} appearances` }))} />
        </Box>
        <Box title="Artists with the most songs">
          <Rank rows={s.artists_most_songs.map((x) => ({ key: x.artist_id, img: x.image ?? "", round: true, label: x.artist_name, href: `/artist/${x.artist_id}`, value: `${x.song_count} songs` }))} />
        </Box>
        <Box title="Songs by country">
          <ul className="space-y-2">
            {s.by_country.map((c) => (
              <li key={c.country} className="flex items-center gap-3 text-sm">
                <span className="w-8 font-bold">{c.country}</span>
                <div className="h-4 flex-1 rounded bg-white/10"><div className="h-full rounded bg-accent" style={{ width: `${(c.songs / maxSongs) * 100}%` }} /></div>
                <span className="w-32 text-right text-muted tabular-nums">{c.songs} songs · {c.artists} artists</span>
              </li>
            ))}
          </ul>
        </Box>
        <Box title="Songs by genre">
          <ul className="space-y-2">
            {s.by_genre.map((g) => (
              <li key={g.genre_id} className="flex items-center gap-3 text-sm">
                <Link href={`/genre/${g.genre_id}`} className="w-28 shrink-0 truncate hover:underline">{g.genre_name}</Link>
                <div className="h-4 flex-1 rounded bg-white/10"><div className="h-full rounded bg-accent" style={{ width: `${(g.songs / Math.max(1, s.by_genre[0].songs)) * 100}%` }} /></div>
                <span className="w-28 text-right text-muted tabular-nums">{g.songs} songs · {g.plays} plays</span>
              </li>
            ))}
          </ul>
        </Box>
        <Box title="Biggest public playlists">
          <Rank rows={s.biggest_playlists.map((x) => ({ key: x.playlist_id, label: x.playlist_name, sub: `by ${x.owner}`, href: `/playlist/${x.playlist_id}`, value: `${x.song_count} songs` }))} />
        </Box>
        <Box title="Top curators">
          <Rank rows={s.top_curators.map((x) => ({ key: x.user_id, label: x.user_name, href: `/user/${x.user_id}`, value: `${x.playlists} public playlists` }))} />
        </Box>
      </div>
    </div>
  );
}
