"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api, send, type Song } from "@/lib/api";
import { store } from "@/lib/store";
import { loadYT, previewUrl, type YTPlayer } from "@/lib/youtube";
import { useToast } from "./Toast";
import { usePlayerShortcuts } from "./PlayerShortcuts";

export type Repeat = "off" | "all" | "one";
export type Panel = "queue" | "lyrics" | null;
export type Sleep = number | "end" | null; // pause at this time (ms), at the end of this song, or never
export type Ctx = {
  current?: Song; queue: Song[]; idx: number; playing: boolean; error: string;
  time: number; duration: number; volume: number; shuffle: boolean; repeat: Repeat; radio: boolean; sleep: Sleep; panel: Panel; sheet: boolean; preview: boolean;
  play: (queue: Song[], index: number) => void;
  shufflePlay: (queue: Song[]) => void;
  toggle: () => void;
  skip: (by: number) => void;
  seek: (s: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  getAudio: () => HTMLAudioElement | null; // the element that plays 30 s previews, so the visualizer can analyse it
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleRadio: () => void;
  setSleep: (minutes: number | "end" | null) => void;
  addToQueue: (s: Song) => void;
  playNext: (s: Song) => void;
  removeFromQueue: (i: number) => void;
  moveInQueue: (from: number, to: number) => void;
  jump: (i: number) => void;
  setPanel: (p: Panel) => void;
  setSheet: (open: boolean) => void;
};
type Prefs = { volume: number; shuffle: boolean; repeat: Repeat; radio: boolean };
const PREFS = "spoot-prefs";
const LAST = "spoot-last"; // { song, t }: what was loaded and how far in, restored paused on the next visit
const PlayerCtx = createContext<Ctx | null>(null);
export const usePlayer = () => useContext(PlayerCtx)!;

// a random index into a list of n, other than `not` when there is a choice
const pick = (n: number, not = -1) => {
  let i = Math.floor(Math.random() * n);
  if (n > 1 && i === not) i = (i + 1) % n;
  return i;
};

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
  const [radio, setRadio] = useState(true); // when the queue runs out, keep going with similar songs
  const [sleep, setSleepAt] = useState<Sleep>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [sheet, setSheet] = useState(false); // phones: the Now playing card is a sheet opened from the player bar
  const [previewId, setPreviewId] = useState<number>(); // song that plays as the 30 s preview instead of its YouTube video
  const player = useRef<YTPlayer | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const previewing = useRef(false); // same as `preview`, readable from the YT / audio callbacks
  const lastVolume = useRef(100);
  const cue = useRef<number | null>(null); // seconds to cue to on the first load after a restore (loaded paused)
  const toast = useToast();
  const current = queue[idx];

  // the YT callbacks are created once, so they read the latest state through this ref
  const live = useRef({ queue, idx, shuffle, repeat, time, volume, playing, sleep });
  const listen = (song: Song) => void send("POST", `/listen/${song.song_id}`).catch(() => {});
  const seekTo = (t: number) => (previewing.current && audio.current ? void (audio.current.currentTime = t) : player.current?.seekTo(t, true));
  const resume = () => (previewing.current && audio.current ? void audio.current.play().catch(() => {}) : player.current?.playVideo());
  const pause = () => (previewing.current && audio.current ? audio.current.pause() : player.current?.pauseVideo?.());

  const step = (by: number, auto = false) => {
    const { queue, idx, shuffle, repeat, time, sleep } = live.current;
    if (auto && sleep === "end") { // the sleep timer was waiting for this song to finish
      setSleepAt(null);
      return setPlaying(false);
    }
    if (auto && repeat === "one") {
      seekTo(0);
      resume();
      return listen(queue[idx]);
    }
    if (by < 0) return time > 3 || idx === 0 ? seekTo(0) : setIdx(idx - 1);
    if (shuffle && queue.length > 1) return setIdx(pick(queue.length, idx));
    if (idx + 1 < queue.length) return setIdx(idx + 1);
    if (repeat === "all") return setIdx(0);
    if (auto) setPlaying(false);
  };
  const stepRef = useRef(step);
  useEffect(() => {
    live.current = { queue, idx, shuffle, repeat, time, volume, playing, sleep };
    stepRef.current = step;
  });

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage is only readable after hydration */
    const p = store.get<Partial<Prefs> | null>(PREFS, null);
    if (p) { setVol(p.volume ?? 100); setShuffle(!!p.shuffle); setRepeat(p.repeat ?? "off"); setRadio(p.radio ?? true); }
    const l = store.get<{ song?: Song; t?: number } | null>(LAST, null);
    if (l?.song) { cue.current = l.t || 0; setQueue([l.song]); setTime(l.t || 0); }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const savePrefs = (p: Partial<Prefs>) => store.set(PREFS, { volume, shuffle, repeat, radio, ...p });

  useEffect(() => {
    if (!current) return;
    let stale = false;
    const r = cue.current; // non-null only for the song restored from the last visit: cue it, don't start it
    cue.current = null;
    store.set(LAST, { song: current, t: r ?? 0 });
    audio.current?.pause(); // leaving a preview behind
    previewing.current = false;
    const fallback = (why: string) => {
      const url = previewUrl(current);
      if (!url) {
        setError(why);
        // nothing to play: move on to the next song instead of sitting on the error
        if (live.current.idx + 1 < live.current.queue.length) {
          toast(`Skipped “${current.song_name}”: ${why}`, true);
          setIdx(live.current.idx + 1);
        }
        return;
      }
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
      audio.current.src = url;
      audio.current.volume = live.current.volume / 100;
      if (r != null) return void (audio.current.currentTime = r);
      listen(current);
      audio.current.play().catch(() => setError("Press play to start the preview"));
    };
    Promise.all([api<{ youtube_id: string }>(`/play/${current.song_id}`), loadYT()])
      .then(([{ youtube_id }]) => {
        if (stale) return;
        setError("");
        if (r == null) listen(current);
        if (player.current) return player.current.loadVideoById(youtube_id);
        // YT replaces its mount node with an iframe, so give it a node React doesn't own
        const mount = document.getElementById("yt-slot")!.appendChild(document.createElement("div"));
        player.current = new window.YT!.Player(mount, {
          videoId: youtube_id,
          width: "100%",
          height: "100%",
          playerVars: { autoplay: r == null ? 1 : 0, playsinline: 1 },
          events: {
            onReady: (e: { target: YTPlayer }) => {
              e.target.setVolume(live.current.volume);
              if (r != null) { e.target.seekTo(r, true); e.target.pauseVideo(); }
            },
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
  }, [current, toast]);

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
      if (live.current.playing) store.set(LAST, { song: current, t: live.current.time });
    }, 500);
    return () => clearInterval(t);
  }, [current]);

  // song radio: as soon as the last song in the queue starts, append similar ones, so they show up in the queue before they play
  const last = !!current && idx === queue.length - 1;
  useEffect(() => {
    if (!radio || !last || repeat !== "off" || !current) return;
    let stale = false;
    const have = new Set(live.current.queue.map((s) => s.song_id));
    api<Song[]>(`/radio/${current.song_id}?exclude=${[...have].slice(-200)}`)
      .then((songs) => !stale && setQueue((q) => [...q, ...songs.filter((s) => !have.has(s.song_id)).map((s) => ({ ...s, radio: true }))]))
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [radio, last, repeat, current]);

  // sleep timer (minutes); "end of song" is handled in step()
  useEffect(() => {
    if (typeof sleep !== "number") return;
    const t = setTimeout(() => {
      pause();
      setSleepAt(null);
      toast("Sleep timer: paused");
    }, Math.max(0, sleep - Date.now()));
    return () => clearTimeout(t);
  }, [sleep, toast]);

  const toggle = () => {
    if (previewing.current && audio.current) return void (audio.current.paused ? audio.current.play().catch(() => {}) : audio.current.pause());
    return playing ? player.current?.pauseVideo?.() : player.current?.playVideo?.(); // not there yet while the iframe is still loading
  };
  const ctx: Ctx = {
    current, queue, idx, playing, error, time, duration, volume, shuffle, repeat, radio, sleep, panel, sheet, preview: previewId !== undefined && previewId === current?.song_id,
    play: (q, i) => {
      // pressing play on the song that is already loaded pauses / resumes it instead of reloading it; keep its object so the load effect stays put
      const same = current && q[i]?.song_id === current.song_id;
      setQueue(same ? q.map((s, j) => (j === i ? current : s)) : q);
      setIdx(i);
      if (same) toggle();
    },
    shufflePlay: (q) => {
      if (!q.length) return;
      const i = pick(q.length, q.findIndex((s) => s.song_id === current?.song_id)); // play() would pause the song that is already loaded
      savePrefs({ shuffle: true });
      setShuffle(true);
      ctx.play(q, i);
    },
    toggle,
    skip: (by) => step(by),
    seek: (s) => {
      seekTo(s);
      setTime(s);
    },
    setVolume: (v) => {
      setVol(v);
      savePrefs({ volume: v });
      player.current?.setVolume(v);
      if (audio.current) audio.current.volume = v / 100;
    },
    getAudio: () => audio.current,
    toggleMute: () => {
      if (volume) lastVolume.current = volume; // un-mute returns to where it was, not always 100
      ctx.setVolume(volume ? 0 : lastVolume.current || 100);
    },
    toggleShuffle: () => (savePrefs({ shuffle: !shuffle }), setShuffle(!shuffle)),
    cycleRepeat: () => {
      const r = repeat === "off" ? "all" : repeat === "all" ? "one" : "off";
      savePrefs({ repeat: r });
      setRepeat(r);
    },
    toggleRadio: () => (savePrefs({ radio: !radio }), setRadio(!radio)),
    setSleep: (m) => setSleepAt(typeof m === "number" ? Date.now() + m * 60_000 : m),
    addToQueue: (s) => (queue.length ? setQueue([...queue, s]) : (setQueue([s]), setIdx(0))),
    playNext: (s) => (queue.length ? setQueue([...queue.slice(0, idx + 1), s, ...queue.slice(idx + 1)]) : (setQueue([s]), setIdx(0))),
    removeFromQueue: (i) => {
      if (i === idx) return;
      setQueue(queue.filter((_, j) => j !== i));
      if (i < idx) setIdx(idx - 1);
    },
    moveInQueue: (from, to) => {
      if (from === to) return;
      const q = [...queue];
      q.splice(to, 0, q.splice(from, 1)[0]);
      setQueue(q);
      setIdx(idx === from ? to : from < idx && to >= idx ? idx - 1 : from > idx && to <= idx ? idx + 1 : idx); // the playing song stays the playing song
    },
    jump: setIdx,
    setPanel,
    setSheet,
  };
  usePlayerShortcuts(ctx);
  return <PlayerCtx.Provider value={ctx}>{children}</PlayerCtx.Provider>;
}

export function ShuffleButton({ songs, className = "" }: { songs: Song[]; className?: string }) {
  const { shufflePlay } = usePlayer();
  return (
    <button disabled={!songs.length} onClick={() => shufflePlay(songs)} className={`flex items-center gap-2 rounded-full bg-raised px-5 py-3 font-bold hover:scale-105 hover:bg-white/15 disabled:opacity-40 ${className}`}>
      <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden><path d="M13.15.65a.5.5 0 0 1 .7 0l2 2a.5.5 0 0 1 0 .7l-2 2a.5.5 0 0 1-.7-.7L14.29 3.5h-1.4a3 3 0 0 0-2.4 1.2l-.99 1.32-.8-.6L9.7 4.1A4 4 0 0 1 12.9 2.5h1.39l-1.14-1.15a.5.5 0 0 1 0-.7ZM0 3.5h2.5a4 4 0 0 1 3.2 1.6l4.8 6.4a3 3 0 0 0 2.4 1.2h1.4l-1.15-1.15a.5.5 0 0 1 .7-.7l2 2a.5.5 0 0 1 0 .7l-2 2a.5.5 0 0 1-.7-.7L14.29 13.5h-1.4a4 4 0 0 1-3.2-1.6L4.9 5.5A3 3 0 0 0 2.5 4.3H0v-.8Z" /></svg>
      Shuffle play
    </button>
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
