"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, art, QUEUE_DRAG, type Song } from "@/lib/api";
import { Cover } from "./ui";
import { Canvas } from "./Canvas";
import { usePlayer, type Panel } from "./Player";

// LRC lines look like "[01:23.45] some words"
function parseLrc(lrc: string) {
  return lrc.split("\n").flatMap((l) => {
    const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    return m ? [{ at: +m[1] * 60 + +m[2], text: m[3].trim() }] : [];
  });
}

type LyricsRes = { plain?: string | null; synced?: string | null; instrumental?: boolean; error?: string };
function Lyrics({ song }: { song: Song }) {
  const { time } = usePlayer();
  const [res, setRes] = useState<LyricsRes | "loading">("loading");
  useEffect(() => {
    api<LyricsRes>(`/lyrics/${song.song_id}`).then(setRes).catch((e) => setRes({ error: e.message }));
  }, [song.song_id]);
  const lines = res !== "loading" && res.synced ? parseLrc(res.synced) : [];
  const now = lines.findLastIndex((l) => l.at <= time);
  useEffect(() => {
    document.getElementById("lyric-now")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [now]);

  if (res === "loading") return <p className="text-sm text-muted">Loading lyrics…</p>;
  if (res.error) return <p className="text-sm text-muted">{res.error}</p>;
  if (res.instrumental) return <p className="text-sm text-muted">Instrumental.</p>;
  if (!res.plain && !lines.length) return <p className="text-sm text-muted">No lyrics found for this song.</p>;
  return (
    <div>
      {lines.length ? (
        lines.map((l, i) => (
          <p key={i} id={i === now ? "lyric-now" : undefined} className={`py-0.5 text-lg font-bold ${i === now ? "text-white" : i < now ? "text-white/40" : "text-white/60"}`}>
            {l.text || "♪"}
          </p>
        ))
      ) : (
        <p className="whitespace-pre-line text-sm leading-relaxed">{res.plain}</p>
      )}
      <p className="mt-4 text-xs text-muted">Lyrics from LRCLIB</p>
    </div>
  );
}

function Queue() {
  const { queue, idx, jump, removeFromQueue, moveInQueue, radio, toggleRadio } = usePlayer();
  const firstRadio = queue.findIndex((s) => s.radio);
  return (
    <>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={radio} onChange={toggleRadio} className="accent-accent" />
        Autoplay similar songs when the queue ends
      </label>
      <ol className="space-y-1 text-sm">
        {queue.map((s, i) => (
          <li key={`${s.song_id}-${i}`} draggable title="Drag to reorder"
            onDragStart={(e) => e.dataTransfer.setData(QUEUE_DRAG, String(i))}
            onDragOver={(e) => e.dataTransfer.types.includes(QUEUE_DRAG) && e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); moveInQueue(+e.dataTransfer.getData(QUEUE_DRAG), i); }}
            className={`group flex flex-wrap items-center gap-2 rounded p-1 hover:bg-white/[.07] ${i === idx ? "text-accent" : ""}`}>
            {i === firstRadio && <span className="w-full pt-2 text-xs font-bold text-muted">Radio: songs like the last one you picked</span>}
            <button onClick={() => jump(i)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <Cover name={s.song_name} src={art(s)} className="w-8 shrink-0" />
              <span className="min-w-0"><span className="block truncate">{s.song_name}</span><span className="block truncate text-xs text-muted">{s.artist_name}</span></span>
            </button>
            {i !== idx && <button aria-label={`Remove ${s.song_name} from queue`} onClick={() => removeFromQueue(i)} className="px-1 text-muted opacity-0 group-hover:opacity-100 hover:text-white">✕</button>}
          </li>
        ))}
      </ol>
    </>
  );
}

// YouTube terms: the player must stay visible (>= 200x200), so it lives here instead of being hidden
export function NowPlaying() {
  const { current, error, preview, panel, setPanel, sheet, setSheet } = usePlayer();
  const tab = (p: Exclude<Panel, null>, label: string) => (
    <button onClick={() => setPanel(panel === p ? null : p)} className={`rounded-full px-3 py-1 text-sm font-bold ${panel === p ? "bg-white text-black" : "bg-raised hover:bg-white/15"}`}>
      {label}
    </button>
  );
  return (
    <aside className={`w-(--np) shrink-0 flex-col gap-3 overflow-y-auto rounded-lg bg-panel p-4 max-lg:glass max-lg:fixed max-lg:inset-x-2 max-lg:top-16 max-lg:bottom-36 max-lg:z-40 max-lg:w-auto ${current ? "flex" : "hidden"} ${sheet ? "" : "max-lg:pointer-events-none max-lg:opacity-0"}`}>
      <div className="flex items-center justify-between">
        <p className="font-bold">Now playing</p>
        <button aria-label="Close" onClick={() => setSheet(false)} className="px-2 text-muted hover:text-white lg:hidden">✕</button>
      </div>
      <div className="relative shrink-0">
        <div id="yt-slot" className="aspect-square w-full overflow-hidden rounded-lg bg-black" />
        {/* no video while the 30 s preview plays: show the cover and say why */}
        {preview && current && (
          <div className="absolute inset-0 flex flex-col overflow-hidden rounded-lg bg-black">
            <Cover name={current.song_name} src={art(current)} className="w-full !rounded-none" />
            <p className="absolute inset-x-0 bottom-0 bg-black/70 p-2 text-center text-xs">No full video for this song, playing the 30-second preview</p>
          </div>
        )}
      </div>
      {current && <Canvas key={current.song_id} songId={current.song_id} />}
      {error && <p className="rounded bg-red-500/20 p-2 text-sm text-red-300">{error}</p>}
      <div>
        <p className="text-xl font-bold">{current?.song_name}</p>
        <Link href={`/artist/${current?.artist_id}`} className="text-muted hover:text-white hover:underline">{current?.artist_name}</Link>
      </div>
      <div className="flex gap-2">{tab("queue", "Queue")}{tab("lyrics", "Lyrics")}</div>
      {panel === "lyrics" && current && <Lyrics key={current.song_id} song={current} />}
      {panel === "queue" && <Queue />}
    </aside>
  );
}
