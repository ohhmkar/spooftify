"use client";
import { useEffect, useRef, useState } from "react";
import { mmss, art } from "@/lib/api";
import { Cover } from "./ui";
import { LikeButton } from "./Likes";
import { Visualizer } from "./Visualizer";
import { Resizer, setPane } from "./Resizer";
import { usePlayer } from "./Player";

const icon = "size-4";

// Seek / volume slider: grows on hover, shows the value under the pointer, keyboard and touch work (role=slider)
function Slider({ label, value, max, onChange, fmt = String, className = "" }: { label: string; value: number; max: number; onChange: (v: number) => void; fmt?: (v: number) => string; className?: string }) {
  const [hover, setHover] = useState<number | null>(null); // pointer position as a fraction of the track
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  const clamp = (n: number) => Math.min(max, Math.max(0, n));
  return (
    <div
      role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={fmt(value)}
      className={`group relative flex h-4 cursor-pointer touch-none items-center ${className}`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onChange(Math.round(at(e) * max)); }}
      onPointerMove={(e) => { setHover(at(e)); if (e.buttons) onChange(Math.round(at(e) * max)); }}
      onPointerLeave={() => setHover(null)}
      onKeyDown={(e) => {
        const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
        if (d) { e.preventDefault(); onChange(clamp(value + d * Math.max(1, Math.round(max / 20)))); }
      }}
    >
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/20 transition-[height] group-hover:h-2 group-focus-visible:h-2">
        <div className="h-full bg-white group-hover:bg-accent" style={{ width: `${(value / max) * 100}%` }} />
      </div>
      {hover != null && <span className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-raised px-1.5 py-0.5 text-xs shadow" style={{ left: `${hover * 100}%` }}>{fmt(Math.round(hover * max))}</span>}
    </div>
  );
}

// moon button: pause after N minutes or at the end of this song; shows the minutes left while set
const SLEEP = [[15, "15 minutes"], [30, "30 minutes"], [45, "45 minutes"], [60, "1 hour"], ["end", "End of this song"]] as const;
function SleepTimer({ className }: { className: string }) {
  const { sleep, setSleep } = usePlayer();
  const [left, setLeft] = useState<number | null>(null); // whole minutes, rounded up
  useEffect(() => {
    if (typeof sleep !== "number") return;
    const tick = () => setLeft(Math.ceil((sleep - Date.now()) / 60_000));
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, [sleep]);
  const close = (el: HTMLElement) => el.closest("details")?.removeAttribute("open");
  return (
    <details className="relative">
      <summary aria-label={sleep ? "Sleep timer on" : "Sleep timer"} title="Sleep timer" className={`${className} cursor-pointer list-none`}>
        <svg viewBox="0 0 16 16" className={icon} fill="currentColor"><path d="M6.5 1.5a6.5 6.5 0 1 0 8 8 5.5 5.5 0 0 1-8-8Z" /></svg>
        {sleep && <span className="absolute -top-1 -right-1 rounded bg-accent px-0.5 text-[9px] leading-tight font-bold text-black">{sleep === "end" ? "♪" : left}</span>}
      </summary>
      <div className="absolute right-0 bottom-10 z-30 flex w-44 flex-col rounded-lg bg-raised p-1 text-sm shadow-xl shadow-black/60" onClick={(e) => (e.target as HTMLElement).tagName === "BUTTON" && close(e.target as HTMLElement)}>
        <p className="px-3 py-1.5 text-xs font-bold text-muted">Sleep timer</p>
        {SLEEP.map(([v, label]) => (
          <button key={v} onClick={() => setSleep(v)} className="rounded px-3 py-1.5 text-left hover:bg-white/10">{label}</button>
        ))}
        {sleep && <button onClick={() => setSleep(null)} className="rounded px-3 py-1.5 text-left text-red-300 hover:bg-white/10">Turn off</button>}
      </div>
    </details>
  );
}

// bar heights the chevron snaps between (px); the mode follows the real height, so dragging gets the same layouts
const SNAPS = [52, 80, 160];
export function PlayerBar() {
  const p = usePlayer();
  const { current, playing, toggle, skip, time, duration, seek, volume, setVolume, shuffle, repeat } = p;
  const [viz, setViz] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<"compact" | "normal" | "large">("normal");
  const mounted = !!current;
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMode(el.offsetHeight < 64 ? "compact" : el.offsetHeight >= 130 ? "large" : "normal"));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted]);
  if (!current) return null;
  const compact = mode === "compact", large = mode === "large";
  const snap = () => bar.current && setPane("--pb", SNAPS[(SNAPS.findIndex((h) => h >= bar.current!.offsetHeight - 4) + 1) % SNAPS.length]);
  const btn = (on = false) => `grid size-8 place-items-center ${on ? "text-accent" : "text-muted hover:text-white"}`;
  const total = duration || current.duration;
  return (
    <footer ref={bar} className="relative grid h-(--pb) shrink-0 grid-cols-[minmax(0,var(--pl))_minmax(0,1fr)_minmax(0,var(--pr))] items-center gap-4 px-4 max-md:grid-cols-[1fr_auto] max-md:gap-2">
      <Resizer v="--pb" side="top" label="player height" min={48} max={220} className="group absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize touch-none max-md:hidden" />
      <Resizer v="--pl" side="col-l" label="track info" min={120} max={600} className="group absolute z-10 h-full w-2 cursor-col-resize touch-none max-md:hidden" style={{ left: "calc(var(--pl) + 1.25rem)" }} />
      <Resizer v="--pr" side="col-r" label="volume and queue" min={120} max={600} className="group absolute z-10 h-full w-2 cursor-col-resize touch-none max-md:hidden" style={{ right: "calc(var(--pr) + 1.25rem)" }} />
      <div data-col="l" className="flex min-w-0 items-center gap-3">
        <button aria-label="Open now playing" onClick={() => p.setSheet(!p.sheet)} className="flex min-w-0 items-center gap-3 text-left lg:pointer-events-none">
          {!compact && <span className="shrink-0 max-sm:hidden" style={{ width: "clamp(3rem, calc(var(--pb) - 1.5rem), 9rem)" }}><Cover name={current.song_name} src={art(current)} className="w-full" /></span>}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{current.song_name}</span>
            <span className="block truncate text-xs text-muted">
              {p.preview && <span title="YouTube is unavailable for this song" className="mr-1.5 rounded bg-white/15 px-1 text-[10px] font-bold text-white">30s PREVIEW</span>}
              {current.artist_name}
            </span>
            {p.error && <span role="alert" className="block truncate text-xs text-red-300" title={p.error}>{p.error}</span>}
          </span>
        </button>
        {!compact && <LikeButton id={current.song_id} />}
        <button aria-label="Open visualizer" title="Visualizer" onClick={() => setViz(true)} className={`${btn(viz)} ${compact ? "hidden" : ""}`}>
          <svg viewBox="0 0 16 16" className={icon} fill="currentColor"><path d="M1 9h2v6H1zm4-5h2v11H5zm4 3h2v8H9zm4-6h2v14h-2z" /></svg>
        </button>
        {/* ponytail: the overlay covers the YT iframe while open; the song keeps playing underneath */}
        {viz && <Visualizer song={current} time={time} playing={playing} toggle={toggle} previewing={p.preview} getAudio={p.getAudio} onClose={() => setViz(false)} />}
      </div>
      <div className="flex min-w-0 flex-col items-center gap-1">
        <div className={`flex items-center gap-3 max-md:gap-1 ${large ? "gap-5 [&_svg]:size-6" : ""}`}>
          <button aria-label="Shuffle" aria-pressed={shuffle} className={btn(shuffle)} onClick={p.toggleShuffle}>
            <svg viewBox="0 0 16 16" className={icon} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 4h2.5c3 0 4 8 7 8H14M1 12h2.5c1.2 0 2-1.5 2.8-3M14 4h-3.5c-1.2 0-2 1.2-2.8 2.5M12 2l2 2-2 2M12 10l2 2-2 2" /></svg>
          </button>
          <button aria-label="Previous" className={btn()} onClick={() => skip(-1)}>
            <svg viewBox="0 0 16 16" className={icon} fill="currentColor"><path d="M3 2h2v12H3zM6 8l8-6v12z" /></svg>
          </button>
          <button aria-label={playing ? "Pause" : "Play"} onClick={toggle} className={`grid place-items-center rounded-full bg-white text-black hover:scale-105 ${large ? "size-14" : compact ? "size-7" : "size-9"}`}>
            <svg viewBox="0 0 16 16" className={icon} fill="currentColor"><path d={playing ? "M3 2h4v12H3zm6 0h4v12H9z" : "M4 2l10 6-10 6z"} /></svg>
          </button>
          <button aria-label="Next" className={btn()} onClick={() => skip(1)}>
            <svg viewBox="0 0 16 16" className={icon} fill="currentColor"><path d="M11 2h2v12h-2zM10 8 2 2v12z" /></svg>
          </button>
          <button aria-label={`Repeat: ${repeat}`} aria-pressed={repeat !== "off"} className={`${btn(repeat !== "off")} relative`} onClick={p.cycleRepeat}>
            <svg viewBox="0 0 16 16" className={icon} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 7V6a2 2 0 0 1 2-2h9M11 2l2 2-2 2M14 9v1a2 2 0 0 1-2 2H3M5 14l-2-2 2-2" /></svg>
            {repeat === "one" && <span className="absolute -top-0.5 -right-0 text-[9px] font-bold">1</span>}
          </button>
        </div>
        <div className="flex w-full items-center gap-2 text-xs text-muted tabular-nums max-md:w-44">
          <span className="w-10 text-right max-md:hidden">{mmss(Math.floor(time))}</span>
          <Slider label="Seek" max={Math.max(1, Math.floor(total))} value={Math.floor(time)} onChange={seek} fmt={mmss} className="flex-1" />
          <span className="w-10 max-md:hidden">{mmss(Math.floor(total))}</span>
        </div>
      </div>
      <div data-col="r" className="flex items-center justify-end gap-2 max-md:hidden">
        <button aria-label={compact ? "Expand player" : large ? "Shrink player" : "Enlarge player"} title="Player size" onClick={snap} className={btn()}>
          <svg viewBox="0 0 16 16" className={`${icon} ${large ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 10l5-5 5 5" /></svg>
        </button>
        <button aria-label="Lyrics" aria-pressed={p.panel === "lyrics"} onClick={() => p.setPanel(p.panel === "lyrics" ? null : "lyrics")} className={`${btn(p.panel === "lyrics")} text-xs font-bold`}>Aa</button>
        <button aria-label="Queue" aria-pressed={p.panel === "queue"} onClick={() => p.setPanel(p.panel === "queue" ? null : "queue")} className={btn(p.panel === "queue")}>
          <svg viewBox="0 0 16 16" className={icon} fill="currentColor"><path d="M1 3h10v1.5H1zm0 4h10v1.5H1zm0 4h6v1.5H1zm11-1 3 2-3 2z" /></svg>
        </button>
        <SleepTimer className={`${btn(!!p.sleep)} relative`} />
        <button aria-label={volume ? "Mute" : "Unmute"} onClick={p.toggleMute} className={btn()}>
          <svg viewBox="0 0 16 16" className={icon} fill="currentColor"><path d="M2 6h3l4-3v10l-4-3H2z" />{volume > 0 && <path d="M11 5.5a3.5 3.5 0 0 1 0 5" stroke="currentColor" fill="none" strokeWidth="1.3" />}</svg>
        </button>
        <Slider label="Volume" max={100} value={volume} onChange={setVolume} fmt={(n) => `${n}%`} className="w-24 min-w-12 shrink" />
      </div>
    </footer>
  );
}
