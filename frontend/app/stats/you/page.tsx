"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, compact, type Song, type Playlist } from "@/lib/api";
import { Card, Shelf } from "@/components/ui";
import { TrackList } from "@/components/TrackList";
import { useLoggedIn } from "@/components/Likes";

type MyStats = {
  days: number;
  totals: { plays: number; seconds: number; songs: number; artists: number };
  songs: (Song & { my_plays: number })[];
  artists: { artist_id: number; artist_name: string; image?: string; plays: number; seconds: number }[];
  genres: { genre_id: number; genre_name: string; plays: number }[];
  by_day: { day: string; plays: number }[];
  by_hour: number[];
};
const RANGES = [[7, "7 days"], [30, "30 days"], [90, "3 months"], [365, "1 year"]] as const;
const hm = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.round(s / 60)} min`);
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-raised p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// single-series column chart: one hue, columns capped at 24px with 2px air between them, rounded data end, hover shows the value
function Columns({ title, data, label }: { title: string; data: number[]; label: (i: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data);
  return (
    <section className="rounded-lg bg-raised p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted tabular-nums" aria-live="polite">{hover != null ? `${label(hover)}: ${data[hover]} plays` : `Most: ${max} plays`}</p>
      </div>
      <div className="flex h-40 items-end gap-0.5 border-b border-white/15" onPointerLeave={() => setHover(null)}>
        {data.map((v, i) => (
          // the hit target is the whole column slot, taller and wider than the mark itself
          <div key={i} className="flex h-full min-w-0 flex-1 cursor-default items-end justify-center" onPointerEnter={() => setHover(i)} role="img" aria-label={`${label(i)}: ${v} plays`}>
            <div className={`w-full max-w-6 rounded-t ${hover === i ? "bg-white" : "bg-accent"}`} style={{ height: `${(v / max) * 100}%`, minHeight: v ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted"><span>{label(0)}</span><span>{label(data.length - 1)}</span></div>
    </section>
  );
}

export default function YourStats() {
  const loggedIn = useLoggedIn();
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [mine, setMine] = useState<Playlist[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!loggedIn) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    api<MyStats>(`/me/stats?days=${days}&tz=${encodeURIComponent(tz)}`).then((s) => { setStats(s); setErr(""); }).catch((e) => setErr(e.message));
  }, [days, loggedIn]);
  useEffect(() => {
    if (loggedIn) api<Playlist[]>("/me/playlists").then(setMine).catch(() => {});
  }, [loggedIn]);

  if (!loggedIn) return <p className="px-6 py-10 text-muted"><Link href="/login" className="text-white underline">Log in</Link> to see your listening stats.</p>;
  const t = stats?.totals;
  const daily = stats?.by_day ?? []; // the API fills quiet days with 0
  const topGenre = stats?.genres[0]?.plays ?? 1;
  return (
    <div className="px-3 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 px-3">
        <h1 className="text-3xl font-bold">Your listening</h1>
        <div className="flex gap-2">
          {RANGES.map(([d, l]) => (
            <button key={d} aria-pressed={days === d} onClick={() => setDays(d)} className={`rounded-full px-4 py-1.5 text-sm ${days === d ? "bg-white text-black" : "bg-raised hover:bg-white/15"}`}>{l}</button>
          ))}
        </div>
      </div>
      {err && <p className="mx-3 mb-4 rounded bg-red-500/20 p-3 text-sm text-red-300">{err}</p>}
      {!stats ? <p className="px-3 text-muted">Loading…</p> : !t?.plays ? (
        <p className="px-3 text-muted">Nothing played in the last {RANGES.find(([d]) => d === days)?.[1]}. Play something and come back.</p>
      ) : (
        <div className="space-y-8 px-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Listening time" value={hm(t.seconds)} />
            <Tile label="Plays" value={compact(t.plays)} />
            <Tile label="Different songs" value={compact(t.songs)} />
            <Tile label="Different artists" value={compact(t.artists)} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Columns title={days > 90 ? "Plays per day (last 90 days)" : "Plays per day"} data={daily.map((d) => d.plays)}
              label={(i) => new Date(daily[i].day + "T12:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })} />
            <Columns title="When you listen" data={stats.by_hour} label={hourLabel} />
          </div>
          <div className="-mx-3"><Shelf title="Top artists">
            {stats.artists.map((a, i) => <Card key={a.artist_id} href={`/artist/${a.artist_id}`} title={`${i + 1}. ${a.artist_name}`} image={a.image} round subtitle={`${a.plays} plays • ${hm(a.seconds)}`} />)}
          </Shelf></div>
          <section>
            <h2 className="mb-2 text-2xl font-bold">Top songs</h2>
            <TrackList songs={stats.songs} playlists={mine} />
          </section>
          {stats.genres.length > 0 && (
            <section className="max-w-xl">
              <h2 className="mb-3 text-2xl font-bold">Top genres</h2>
              <ol className="space-y-2">
                {stats.genres.map((g) => (
                  <li key={g.genre_id} className="grid grid-cols-[8rem_1fr] items-center gap-3 text-sm">
                    <Link href={`/genre/${g.genre_id}`} className="truncate hover:underline">{g.genre_name}</Link>
                    <span className="flex items-center gap-2">
                      <span className="h-5 rounded-r bg-accent" style={{ width: `${(g.plays / topGenre) * 80}%` }} />
                      <span className="text-muted tabular-nums">{g.plays}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
