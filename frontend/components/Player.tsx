"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, send, mmss, art, type Song } from "@/lib/api";
import { Cover } from "./ui";
import { LikeButton } from "./Likes";
import { Canvas } from "./Canvas";
import { Visualizer } from "./Visualizer";

// Minimal slice of the YouTube IFrame API we use
type YTPlayer = {
  loadVideoById(id: string): void; playVideo(): void; pauseVideo(): void; seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number; getDuration(): number; setVolume(v: number): void;
};
// the 30 s iTunes preview stands in when YouTube cannot give us the song (no API key, daily quota used up, not embeddable)
const previewUrl = (s: Song) => (s.audio_file && /^https?:\/\//.test(s.audio_file) && !s.audio_file.includes("youtube.com") ? s.audio_file : undefined);
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, o: object) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}
let ytReady: Promise<void> | undefined;
const loadYT = () =>
  (ytReady ??= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve();
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.append(s);
  }));

type Repeat = "off" | "all" | "one";
type Panel = "queue" | "lyrics" | null;
type Ctx = {
  current?: Song; queue: Song[]; idx: number; playing: boolean; error: string;
  time: number; duration: number; volume: number; shuffle: boolean; repeat: Repeat; panel: Panel; sheet: boolean; preview: boolean;
  play: (queue: Song[], index: number) => void;
  toggle: () => void;
  skip: (by: number) => void;
  seek: (s: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  getAudio: () => HTMLAudioElement | null; // the element that plays 30 s previews, so the visualizer can analyse it
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (s: Song) => void;
  playNext: (s: Song) => void;
  removeFromQueue: (i: number) => void;
  jump: (i: number) => void;
  setPanel: (p: Panel) => void;
  setSheet: (open: boolean) => void;
};
const PlayerCtx = createContext<Ctx | null>(null);
export const usePlayer = () => useContext(PlayerCtx)!;

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Song[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVol] = useState(100);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>("off");
  const [panel, setPanel] = useState<Panel>(null);
  const [sheet, setSheet] = useState(false); // phones: the Now playing card is a sheet opened from the player bar
  const [previewId, setPreviewId] = useState<number>(); // song that plays as the 30 s preview instead of its YouTube video
  const player = useRef<YTPlayer | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const previewing = useRef(false); // same as `preview`, readable from the YT / audio callbacks
  const lastVolume = useRef(100);
  const current = queue[idx];

  // the YT callbacks are created once, so they read the latest state through this ref
  const live = useRef({ queue, idx, shuffle, repeat, time, volume });
  const listen = (song: Song) => void send("POST", `/listen/${song.song_id}`).catch(() => {});
  const seekTo = (t: number) => (previewing.current && audio.current ? void (audio.current.currentTime = t) : player.current?.seekTo(t, true));
  const resume = () => (previewing.current && audio.current ? void audio.current.play().catch(() => {}) : player.current?.playVideo());

  const step = (by: number, auto = false) => {
    const { queue, idx, shuffle, repeat, time } = live.current;
    if (auto && repeat === "one") {
      seekTo(0);
      resume();
      return listen(queue[idx]);
    }
    if (by < 0) return time > 3 || idx === 0 ? seekTo(0) : setIdx(idx - 1);
    if (shuffle && queue.length > 1) {
      let n = idx;
      while (n === idx) n = Math.floor(Math.random() * queue.length);
      return setIdx(n);
    }
    if (idx + 1 < queue.length) return setIdx(idx + 1);
    if (repeat === "all") return setIdx(0);
    if (auto) setPlaying(false);
  };
  const stepRef = useRef(step);
  useEffect(() => {
    live.current = { queue, idx, shuffle, repeat, time, volume };
    stepRef.current = step;
  });

  useEffect(() => {
    if (!current) return;
    let stale = false;
    audio.current?.pause(); // leaving a preview behind
    previewing.current = false;
    const fallback = (why: string) => {
      const url = previewUrl(current);
      if (!url) return setError(why);
      player.current?.pauseVideo();
      if (!audio.current) {
        const a = new Audio();
        a.crossOrigin = "anonymous"; // iTunes sends CORS headers; needed so an AnalyserNode may read it
        a.onplay = () => previewing.current && setPlaying(true);
        a.onpause = () => previewing.current && setPlaying(false);
        a.onended = () => previewing.current && stepRef.current(1, true);
        audio.current = a;
      }
      previewing.current = true;
      setPreviewId(current.song_id);
      setError("");
      listen(current);
      audio.current.src = url;
      audio.current.volume = live.current.volume / 100;
      audio.current.play().catch(() => setError("Press play to start the preview"));
    };
    Promise.all([api<{ youtube_id: string }>(`/play/${current.song_id}`), loadYT()])
      .then(([{ youtube_id }]) => {
        if (stale) return;
        setError("");
        listen(current);
        if (player.current) return player.current.loadVideoById(youtube_id);
        // YT replaces its mount node with an iframe, so give it a node React doesn't own
        const mount = document.getElementById("yt-slot")!.appendChild(document.createElement("div"));
        player.current = new window.YT!.Player(mount, {
          videoId: youtube_id,
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 1, playsinline: 1 },
          events: {
            onReady: (e: { target: YTPlayer }) => e.target.setVolume(live.current.volume),
            // 0 ended, 1 playing, 2 paused
            onStateChange: (e: { data: number }) => {
              if (previewing.current) return; // the video is only parked while a preview plays
              if (e.data === 0) stepRef.current(1, true);
              if (e.data === 1 || e.data === 2) setPlaying(e.data === 1);
            },
          },
        });
      })
      .catch((e) => !stale && fallback(e.message));
    return () => {
      stale = true;
    };
  }, [current]);

  // progress bar: YT has no time event, so poll while a song is loaded
  useEffect(() => {
    if (!current) return;
    const t = setInterval(() => {
      const p = player.current;
      if (previewing.current && audio.current) {
        setTime(audio.current.currentTime);
        setDuration(audio.current.duration || 30);
      } else if (p?.getCurrentTime) {
        setTime(p.getCurrentTime());
        setDuration(p.getDuration() || current.duration);
      }
    }, 500);
    return () => clearInterval(t);
  }, [current]);

  const toggle = () => {
    if (previewing.current && audio.current) return void (audio.current.paused ? audio.current.play().catch(() => {}) : audio.current.pause());
    return playing ? player.current?.pauseVideo() : player.current?.playVideo();
  };
  const ctx: Ctx = {
    current, queue, idx, playing, error, time, duration, volume, shuffle, repeat, panel, sheet, preview: previewId !== undefined && previewId === current?.song_id,
    play: (q, i) => {
      // pressing play on the song that is already loaded pauses / resumes it instead of reloading it; keep its object so the load effect stays put
      const same = current && q[i]?.song_id === current.song_id;
      setQueue(same ? q.map((s, j) => (j === i ? current : s)) : q);
      setIdx(i);
      if (same) toggle();
    },
    toggle,
    skip: (by) => step(by),
    seek: (s) => {
      seekTo(s);
      setTime(s);
    },
    setVolume: (v) => {
      setVol(v);
      player.current?.setVolume(v);
      if (audio.current) audio.current.volume = v / 100;
    },
    getAudio: () => audio.current,
    toggleMute: () => {
      if (volume) lastVolume.current = volume; // un-mute returns to where it was, not always 100
      ctx.setVolume(volume ? 0 : lastVolume.current || 100);
    },
    toggleShuffle: () => setShuffle((s) => !s),
    cycleRepeat: () => setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off")),
    addToQueue: (s) => (queue.length ? setQueue([...queue, s]) : (setQueue([s]), setIdx(0))),
    playNext: (s) => (queue.length ? setQueue([...queue.slice(0, idx + 1), s, ...queue.slice(idx + 1)]) : (setQueue([s]), setIdx(0))),
    removeFromQueue: (i) => {
      if (i === idx) return;
      setQueue(queue.filter((_, j) => j !== i));
      if (i < idx) setIdx(idx - 1);
    },
    jump: setIdx,
    setPanel,
    setSheet,
  };

  // Space = play / pause, unless a field or button has focus (Space already means something there)
  const toggleRef = useRef(toggle);
  useEffect(() => {
    toggleRef.current = toggle;
  });
  const hasSong = !!current;
  useEffect(() => {
    if (!hasSong) return;
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.code !== "Space" || e.repeat || t.closest("input, textarea, select, button, a, summary, [contenteditable], [role=dialog]")) return;
      e.preventDefault();
      toggleRef.current();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [hasSong]);
  return <PlayerCtx.Provider value={ctx}>{children}</PlayerCtx.Provider>;
}

// LRC lines look like "[01:23.45] some words"
function parseLrc(lrc: string) {
  return lrc.split("\n").flatMap((l) => {
    const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    return m ? [{ at: +m[1] * 60 + +m[2], text: m[3].trim() }] : [];
  });
}

function Lyrics({ song }: { song: Song }) {
  const { time } = usePlayer();
  const [res, setRes] = useState<{ plain?: string | null; synced?: string | null; instrumental?: boolean } | "loading">("loading");
  useEffect(() => {
    api<{ plain?: string | null; synced?: string | null }>(`/lyrics/${song.song_id}`).then(setRes).catch(() => setRes({ plain: null }));
  }, [song.song_id]);
  const lines = res !== "loading" && res.synced ? parseLrc(res.synced) : [];
  const now = lines.findLastIndex((l) => l.at <= time);
  useEffect(() => {
    document.getElementById("lyric-now")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [now]);

  if (res === "loading") return <p className="text-sm text-muted">Loading lyrics…</p>;
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

// YouTube terms: the player must stay visible (>= 200x200), so it lives here instead of being hidden
export function NowPlaying() {
  const { current, error, preview, queue, idx, panel, setPanel, jump, removeFromQueue, sheet, setSheet } = usePlayer();
  const tab = (p: Exclude<Panel, null>, label: string) => (
    <button onClick={() => setPanel(panel === p ? null : p)} className={`rounded-full px-3 py-1 text-sm font-bold ${panel === p ? "bg-white text-black" : "bg-raised hover:bg-white/15"}`}>
      {label}
    </button>
  );
  return (
    <aside className={`w-72 shrink-0 flex-col gap-3 overflow-y-auto rounded-lg bg-panel p-4 max-lg:fixed max-lg:inset-x-2 max-lg:top-16 max-lg:bottom-36 max-lg:z-40 max-lg:w-auto ${current ? "flex" : "hidden"} ${sheet ? "" : "max-lg:pointer-events-none max-lg:opacity-0"}`}>
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
      {panel === "queue" && (
        <ol className="space-y-1 text-sm">
          {queue.map((s, i) => (
            <li key={`${s.song_id}-${i}`} className={`group flex items-center gap-2 rounded p-1 hover:bg-white/[.07] ${i === idx ? "text-accent" : ""}`}>
              <button onClick={() => jump(i)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <Cover name={s.song_name} src={art(s)} className="w-8 shrink-0" />
                <span className="min-w-0"><span className="block truncate">{s.song_name}</span><span className="block truncate text-xs text-muted">{s.artist_name}</span></span>
              </button>
              {i !== idx && <button aria-label={`Remove ${s.song_name} from queue`} onClick={() => removeFromQueue(i)} className="px-1 text-muted opacity-0 group-hover:opacity-100 hover:text-white">✕</button>}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

const icon = "size-4";
export function PlayerBar() {
  const p = usePlayer();
  const { current, playing, toggle, skip, time, duration, seek, volume, setVolume, shuffle, repeat } = p;
  const [viz, setViz] = useState(false);
  if (!current) return null;
  const btn = (on = false) => `grid size-8 place-items-center ${on ? "text-accent" : "text-muted hover:text-white"}`;
  const total = duration || current.duration;
  return (
    <footer className="grid h-20 shrink-0 grid-cols-[1fr_2fr_1fr] items-center gap-4 px-4 max-md:grid-cols-[1fr_auto] max-md:gap-2">
      <div className="flex min-w-0 items-center gap-3">
        <button aria-label="Open now playing" onClick={() => p.setSheet(!p.sheet)} className="flex min-w-0 items-center gap-3 text-left lg:pointer-events-none">
          <Cover name={current.song_name} src={art(current)} className="w-12 shrink-0 max-sm:hidden" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{current.song_name}</span>
            <span className="block truncate text-xs text-muted">
              {p.preview && <span title="YouTube is unavailable for this song" className="mr-1.5 rounded bg-white/15 px-1 text-[10px] font-bold text-white">30s PREVIEW</span>}
              {current.artist_name}
            </span>
            {p.error && <span role="alert" className="block truncate text-xs text-red-300" title={p.error}>{p.error}</span>}
          </span>
        </button>
        <LikeButton id={current.song_id} />
        <button aria-label="Open visualizer" title="Visualizer" onClick={() => setViz(true)} className={btn(viz)}>
          <svg viewBox="0 0 16 16" className={icon} fill="currentColor"><path d="M1 9h2v6H1zm4-5h2v11H5zm4 3h2v8H9zm4-6h2v14h-2z" /></svg>
        </button>
        {/* ponytail: the overlay covers the YT iframe while open; the song keeps playing underneath */}
        {viz && <Visualizer song={current} time={time} playing={playing} toggle={toggle} previewing={p.preview} getAudio={p.getAudio} onClose={() => setViz(false)} />}
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-3 max-md:gap-1">
          <button aria-label="Shuffle" aria-pressed={shuffle} className={btn(shuffle)} onClick={p.toggleShuffle}>
            <svg viewBox="0 0 16 16" className={icon} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 4h2.5c3 0 4 8 7 8H14M1 12h2.5c1.2 0 2-1.5 2.8-3M14 4h-3.5c-1.2 0-2 1.2-2.8 2.5M12 2l2 2-2 2M12 10l2 2-2 2" /></svg>
          </button>
          <button aria-label="Previous" className={btn()} onClick={() => skip(-1)}>
            <svg viewBox="0 0 16 16" className={icon} fill="currentColor"><path d="M3 2h2v12H3zM6 8l8-6v12z" /></svg>
          </button>
          <button aria-label={playing ? "Pause" : "Play"} onClick={toggle} className="grid size-9 place-items-center rounded-full bg-white text-black hover:scale-105">
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
          <input type="range" aria-label="Seek" min={0} max={Math.max(1, Math.floor(total))} value={Math.floor(time)} onChange={(e) => seek(+e.target.value)} className="h-1 flex-1 accent-accent" />
          <span className="w-10 max-md:hidden">{mmss(Math.floor(total))}</span>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 max-md:hidden">
        <button aria-label="Lyrics" aria-pressed={p.panel === "lyrics"} onClick={() => p.setPanel(p.panel === "lyrics" ? null : "lyrics")} className={`${btn(p.panel === "lyrics")} text-xs font-bold`}>Aa</button>
        <button aria-label="Queue" aria-pressed={p.panel === "queue"} onClick={() => p.setPanel(p.panel === "queue" ? null : "queue")} className={btn(p.panel === "queue")}>
          <svg viewBox="0 0 16 16" className={icon} fill="currentColor"><path d="M1 3h10v1.5H1zm0 4h10v1.5H1zm0 4h6v1.5H1zm11-1 3 2-3 2z" /></svg>
        </button>
        <button aria-label={volume ? "Mute" : "Unmute"} onClick={p.toggleMute} className={btn()}>
          <svg viewBox="0 0 16 16" className={icon} fill="currentColor"><path d="M2 6h3l4-3v10l-4-3H2z" />{volume > 0 && <path d="M11 5.5a3.5 3.5 0 0 1 0 5" stroke="currentColor" fill="none" strokeWidth="1.3" />}</svg>
        </button>
        <input type="range" aria-label="Volume" min={0} max={100} value={volume} onChange={(e) => setVolume(+e.target.value)} className="h-1 w-24 accent-accent" />
      </div>
    </footer>
  );
}

export function PlayButton({ songs, index = 0, className = "" }: { songs: Song[]; index?: number; className?: string }) {
  const { play } = usePlayer();
  return (
    <button
      aria-label={`Play ${songs[index]?.song_name ?? ""}`}
      disabled={!songs.length}
      onClick={(e) => {
        e.preventDefault(); // inside card links
        play(songs, index);
      }}
      className={`grid size-12 place-items-center rounded-full bg-accent text-black shadow-lg shadow-black/40 transition hover:scale-105 disabled:opacity-40 ${className}`}
    >
      <svg viewBox="0 0 16 16" className="size-5" fill="currentColor"><path d="M4 2l10 6-10 6z" /></svg>
    </button>
  );
}
