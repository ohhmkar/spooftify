"use client";
// WMP-style visualizations. Where the real audio comes from (an AnalyserNode gives the FFT and waveform):
//  - "shared": the song already plays as the 30 s preview in the player, so that same audio element is tapped (no permission needed)
//  - "capture": "Sync to audio" shares this tab's sound (getDisplayMedia, Chrome / Edge), which carries the full YouTube song
//  - "own": "Visualizer preview" plays the preview itself, pausing the full song
// the YouTube iframe is cross-origin, so without one of those the visuals are beat-synced (BPM + playback time + a synthetic spectrum).
import { useEffect, useRef, useState } from "react";
import { thumb, type Song } from "@/lib/api";
import { hue } from "./ui";

type VizSong = Song & { audio_file?: string; bpm?: number };
type Real = "" | "own" | "capture" | "shared";

// an <audio> element can be wrapped by createMediaElementSource only once and then plays only through that graph, so the wrapper
// lives as long as the element and stays wired to the speakers; analysers are attached and removed as the overlay opens and closes
type Tap = { ctx: AudioContext; src: MediaElementAudioSourceNode };
function tap(el: HTMLAudioElement & { __tap?: Tap }) { // kept on the element itself, so it also survives a hot reload of this module
  if (!el.__tap) {
    const ctx = new AudioContext(), src = ctx.createMediaElementSource(el);
    src.connect(ctx.destination);
    el.__tap = { ctx, src };
  }
  void el.__tap.ctx.resume();
  return el.__tap;
}
const analyser = (ctx: AudioContext) => { const an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.75; return an; };
const MODES = { bars: "Bars", battery: "Battery", alchemy: "Alchemy", scope: "Scope" } as const;
type Mode = keyof typeof MODES;
const N = 64, W = 256;

// smooth 1D value noise, enough for a "live" fake spectrum
const rnd = (i: number) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };
const noise = (x: number) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return rnd(i) * (1 - u) + rnd(i + 1) * u; };
const col = (h: number, l = 60, a = 1) => `hsl(${h} 85% ${l}% / ${a})`;

// dominant hues of the cover: 12 hue buckets weighted by chroma
function coverHues(img: HTMLImageElement) {
  const c = document.createElement("canvas"); c.width = c.height = 24;
  const x = c.getContext("2d")!; x.drawImage(img, 0, 0, 24, 24);
  const d = x.getImageData(0, 0, 24, 24).data, bins = new Array(12).fill(0), sum = new Array(12).fill(0); // throws if tainted
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), ch = mx - Math.min(r, g, b);
    if (ch < 0.12) continue;
    const h = 60 * (mx === r ? ((g - b) / ch + 6) % 6 : mx === g ? (b - r) / ch + 2 : (r - g) / ch + 4);
    bins[Math.floor(h / 30) % 12] += ch; sum[Math.floor(h / 30) % 12] += h * ch;
  }
  const top = bins.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).filter((b) => b[0] > 0);
  if (!top.length) return null; // greyscale art
  const at = (k: number) => sum[top[k][1]] / top[k][0];
  return [at(0), top[1] ? at(1) : at(0) + 50, top[2] ? at(2) : at(0) + 180];
}

export function Visualizer({ song, time, playing, toggle, previewing, getAudio, onClose }: { song: VizSong; time: number; playing: boolean; toggle: () => void; previewing: boolean; getAudio: () => HTMLAudioElement | null; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>(() => { const m = localStorage.getItem("viz-mode"); return m && m in MODES ? (m as Mode) : "bars"; });
  const [previewOf, setPreviewOf] = useState<number | null>(null); // keyed by song, so a song change turns preview off
  const [err, setErr] = useState("");
  const [capture, setCapture] = useState(false); // tab audio is being analysed
  const preview = previewOf === song.song_id;
  const real: Real = previewing ? "shared" : capture ? "capture" : preview ? "own" : "";
  const hasPreview = !!song.audio_file && !/youtube\.com/.test(song.audio_file); // seed falls back to a watch URL
  const bpm = song.bpm || 120; // ponytail: no BPM yet -> 120
  const canvas = useRef<HTMLCanvasElement>(null), audio = useRef<HTMLAudioElement>(null), root = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null);
  const graph = useRef<{ ctx: AudioContext; an: AnalyserNode } | null>(null); // "own": the overlay's private preview element
  const cap = useRef<{ ctx: AudioContext; an: AnalyserNode; track: MediaStreamTrack } | null>(null);
  const sh = useRef<AnalyserNode | null>(null);
  const live = useRef({ song, bpm, playing, toggle, onClose, mode, preview, real, getAudio, shared: null as HTMLAudioElement | null, resume: false, pal: [0, 60, 180], anchor: { t: time, at: 0 } });
  useEffect(() => { Object.assign(live.current, { song, bpm, playing, toggle, onClose, mode, preview, real, getAudio, shared: previewing ? getAudio() : null }); });

  // the song plays as a preview in the player: analyse that very element
  useEffect(() => {
    const el = previewing ? live.current.getAudio() : null;
    if (!el) return;
    const t = tap(el), an = analyser(t.ctx);
    t.src.connect(an);
    sh.current = an;
    return () => { t.src.disconnect(an); sh.current = null; };
  }, [previewing, song.song_id]);

  const stopCapture = () => {
    cap.current?.track.stop();
    void cap.current?.ctx.close();
    cap.current = null;
    setCapture(false);
  };
  // "Sync to audio": the browser asks which tab to share; with "also share tab audio" the whole song (YouTube included) reaches the analyser
  const syncLive = async () => {
    setErr("");
    if (capture) return stopCapture();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true, selfBrowserSurface: "include", systemAudio: "include" } as DisplayMediaStreamOptions);
      const track = stream.getAudioTracks()[0];
      if (!track) {
        stream.getTracks().forEach((t) => t.stop());
        return setErr("No audio was shared. Choose this tab and tick “Also share tab audio”.");
      }
      stream.getVideoTracks().forEach((t) => t.stop()); // only the sound is wanted
      const ctx = new AudioContext(), an = analyser(ctx);
      ctx.createMediaStreamSource(new MediaStream([track])).connect(an); // not to the speakers: the tab already plays the song
      track.onended = stopCapture; // "Stop sharing" in the browser bar
      cap.current = { ctx, an, track };
      setCapture(true);
    } catch (e) {
      setErr((e as Error).name === "NotAllowedError" ? "Sharing was cancelled, so the visuals stay beat-synced." : (e as Error).message);
    }
  };
  // YT time is polled every 500ms; extrapolate between polls for smooth beats (frozen while paused)
  useEffect(() => { live.current.anchor = { t: time, at: performance.now() }; }, [time, playing]);

  // palette from the cover; iTunes art and i.ytimg.com both send CORS headers, else hash the id
  useEffect(() => {
    const h = hue(String(song.song_id));
    live.current.pal = [h, h + 60, h + 180];
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { try { live.current.pal = coverHues(img) ?? live.current.pal; } catch { /* tainted canvas: keep hashed palette */ } };
    img.src = song.album_cover || thumb(song.youtube_id) || "";
  }, [song.song_id, song.album_cover, song.youtube_id]);

  const togglePreview = () => {
    const a = audio.current!, L = live.current;
    setErr("");
    if (preview) {
      a.pause(); setPreviewOf(null);
      if (L.resume) L.toggle();
      return;
    }
    if (!graph.current) {
      const ctx = new AudioContext(), an = analyser(ctx);
      ctx.createMediaElementSource(a).connect(an); an.connect(ctx.destination);
      graph.current = { ctx, an };
    }
    void graph.current.ctx.resume();
    L.resume = L.playing;
    if (L.playing) L.toggle(); // pause the full song while the preview plays
    a.currentTime = 0;
    a.play().catch((e) => setErr(e.message));
    setPreviewOf(song.song_id);
  };

  // closing the overlay restores the full song
  useEffect(() => {
    const a = audio.current, L = live.current, g = graph;
    return () => {
      a?.pause();
      if (L.preview && L.resume) L.toggle();
      void g.current?.ctx.close();
      cap.current?.track.stop();
      void cap.current?.ctx.close();
      if (document.fullscreenElement) void document.exitFullscreen();
    };
  }, []);

  const pick = (m: Mode) => { setMode(m); localStorage.setItem("viz-mode", m); };
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen())?.catch(() => {});
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target as HTMLElement).closest("input, textarea, select")) { // pause / play, not "press the focused button"
        e.preventDefault();
        if (e.type === "keydown" && !e.repeat) live.current.toggle();
        return;
      }
      if (e.type === "keyup") return;
      if (e.key === "Escape" && !document.fullscreenElement) live.current.onClose();
      const m = Object.keys(MODES)[+e.key - 1] as Mode | undefined;
      if (m) pick(m);
    };
    const prev = document.activeElement as HTMLElement | null;
    addEventListener("keydown", key);
    addEventListener("keyup", key); // a focused button fires its click on Space keyup, so swallow that too
    close.current?.focus(); // after capturing prev, so closing returns focus to the opener
    return () => { removeEventListener("keydown", key); removeEventListener("keyup", key); prev?.focus(); };
  }, []);

  // the render loop: only exists while the overlay is mounted, and stops while the tab is hidden
  useEffect(() => {
    const cv = canvas.current!, g = cv.getContext("2d")!;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const spec = new Float32Array(N), peaks = new Float32Array(N), wave = new Float32Array(W), fft = new Uint8Array(512), td = new Uint8Array(1024);
    let raf = 0, lastT = 0, lastDraw = 0, beatN = -1, bassAvg = 0, lastHit = -1, kick = 0, rot = 0, mode = "";
    let parts: { x: number; y: number; vx: number; vy: number; h: number; life: number }[] = [];
    // ponytail: 1 canvas px per CSS px; the feedback modes get slow at devicePixelRatio 2+
    const size = () => { cv.width = innerWidth; cv.height = innerHeight; g.fillStyle = "#000"; g.fillRect(0, 0, cv.width, cv.height); };
    size();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (calm && now - lastDraw < 250) return; // reduced motion: a few calm frames a second
      lastDraw = now;
      const L = live.current, a = audio.current!;
      const an = L.real === "own" ? graph.current?.an : L.real === "shared" ? sh.current ?? undefined : L.real === "capture" ? cap.current?.an : undefined;
      const el = L.real === "own" ? a : L.real === "shared" ? L.shared : null; // the element whose clock drives the visuals; a tab capture has none
      const on = an && el ? !el.paused : L.playing;
      const t = an && el ? el.currentTime : L.anchor.t + (on && L.anchor.at ? (now - L.anchor.at) / 1000 : 0);
      const dt = Math.min(Math.max(t - lastT, 0), 0.1);
      lastT = t;
      let hit = false;
      if (an) {
        an.getByteFrequencyData(fft); an.getByteTimeDomainData(td);
        for (let i = 0; i < N; i++) { // roughly log-spaced bins
          const lo = Math.round(1.5 + 380 * (i / N) ** 2), hi = Math.max(lo + 1, Math.round(1.5 + 380 * ((i + 1) / N) ** 2));
          let m = 0;
          for (let k = lo; k < hi; k++) m = Math.max(m, fft[k]);
          spec[i] = m / 255;
        }
        for (let j = 0; j < W; j++) wave[j] = (td[j * 4] - 128) / 128;
        const bass = (spec[0] + spec[1] + spec[2] + spec[3]) / 4;
        bassAvg += (bass - bassAvg) * 0.05;
        if (on && bass > bassAvg * 1.2 + 0.04 && t - lastHit > 0.28) { hit = true; lastHit = t; }
        kick = hit ? 1 : kick * Math.exp(-dt * 6);
      } else {
        const ph = (t * L.bpm) / 60, f = ph % 1, hat = Math.exp(-((ph * 2) % 1) * 10);
        if (Math.floor(ph) !== beatN) { hit = beatN >= 0 && on; beatN = Math.floor(ph); }
        kick = Math.exp(-f * 5);
        for (let i = 0; i < N; i++) {
          const x = i / N;
          spec[i] = Math.min(1, 0.08 + 0.55 * (1 - x) ** 0.7 * noise(i * 0.25 + t * 1.5) + 0.25 * noise(i * 0.9 - t * 3 + 50) * (0.4 + x) + kick * 0.5 * (1 - x) ** 3 + hat * 0.22 * x * x);
        }
        for (let j = 0; j < W; j++) {
          const w = (j / W) * Math.PI * 2;
          wave[j] = (0.35 + kick * 0.5) * (spec[2] * Math.sin(w * 2 + t * 2) + spec[16] * 0.6 * Math.sin(w * 7 - t * 5) + spec[40] * 0.4 * Math.sin(w * 19 + t * 9));
        }
      }
      if (calm) { kick *= 0.25; hit = false; }
      for (let i = 0; i < N; i++) peaks[i] = spec[i] > peaks[i] ? spec[i] : Math.max(0, peaks[i] - dt * 0.5);

      const w = cv.width, h = cv.height, cx = w / 2, cy = h / 2, m = Math.min(w, h), [p0, p1, p2] = L.pal;
      if (mode !== L.mode) { mode = L.mode; parts = []; g.globalCompositeOperation = "source-over"; g.fillStyle = "#000"; g.fillRect(0, 0, w, h); }
      g.globalCompositeOperation = "source-over";
      if (!calm) rot += dt * (0.2 + kick * 0.8);

      if (mode === "bars") {
        g.fillStyle = "#050507"; g.fillRect(0, 0, w, h);
        const bw = w / N, base = h * 0.7, H = h * 0.55, grad = g.createLinearGradient(0, base, 0, base - H);
        grad.addColorStop(0, col(p0, 40)); grad.addColorStop(1, col(p1, 65));
        for (let i = 0; i < N; i++) {
          const bh = spec[i] * H;
          g.fillStyle = grad; g.fillRect(i * bw + 1, base - bh, bw - 2, bh);
          g.globalAlpha = 0.15; g.fillRect(i * bw + 1, base + 3, bw - 2, bh * 0.35); g.globalAlpha = 1; // floor reflection
          g.fillStyle = col(p2, 80); g.fillRect(i * bw + 1, base - peaks[i] * H - 7, bw - 2, 3);
        }
      } else if (mode === "battery") {
        // feedback tunnel: previous frame drawn back zoomed + rotated (drawImage of a canvas onto itself is allowed)
        if (!calm) {
          const z = 1 + dt * (0.5 + kick * 1.5);
          g.save(); g.translate(cx, cy); g.rotate(dt * (0.3 + kick * 0.9)); g.scale(z, z); g.drawImage(cv, -cx, -cy); g.restore();
        }
        g.fillStyle = `rgba(0,0,0,${calm ? 0.5 : Math.min(1, dt * 1.5)})`; g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = "lighter"; g.lineWidth = 1.5 + kick * 4; g.lineCap = "round";
        for (let k = 0; k < 8; k++) { // 8 mirrored wedges = kaleidoscope
          g.save(); g.translate(cx, cy); g.rotate((k * Math.PI) / 4 + rot); g.scale(1, k % 2 ? -1 : 1);
          g.strokeStyle = col([p0, p1, p2][k % 3], 60, 0.7);
          g.beginPath();
          for (let i = 0; i < N; i += 2) { const r = (i / N) * m * 0.42, y = spec[i] * m * 0.1 * Math.sin(i * 0.3 + rot * 2); g[i ? "lineTo" : "moveTo"](r, y); }
          g.stroke();
          g.restore();
        }
        g.fillStyle = col(p2, 70, 0.25 + kick * 0.5);
        g.beginPath(); g.arc(cx, cy, m * (0.02 + kick * 0.05), 0, Math.PI * 2); g.fill();
      } else if (mode === "alchemy") {
        g.fillStyle = `rgba(0,0,0,${calm ? 0.3 : Math.min(1, dt * 3)})`; g.fillRect(0, 0, w, h);
        const level = spec.reduce((s, v) => s + v, 0) / N, add = (n: number, sp: number) => {
          for (let i = 0; i < n && parts.length < 1500; i++) {
            const ang = Math.random() * Math.PI * 2, v = sp * (0.4 + Math.random());
            parts.push({ x: 0, y: 0, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, h: [p0, p1, p2][i % 3] + Math.random() * 30, life: 1 });
          }
        };
        if (hit) add(90, m * 0.9); // burst on the beat
        add(Math.round(dt * 120 * level), m * 0.25);
        g.globalCompositeOperation = "lighter"; g.lineWidth = 2;
        for (const p of parts) {
          const ang = (noise(p.x * 0.004 + t * 0.2) + noise(p.y * 0.004 - t * 0.2 + 30)) * Math.PI * 2, ox = p.x, oy = p.y;
          p.vx += Math.cos(ang) * dt * m * 0.5; p.vy += Math.sin(ang) * dt * m * 0.5;
          p.vx *= 1 - dt * 1.2; p.vy *= 1 - dt * 1.2;
          p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 0.45;
          g.strokeStyle = col(p.h, 60, Math.max(0, p.life) * 0.8);
          g.beginPath(); g.moveTo(cx + ox, cy + oy); g.lineTo(cx + p.x, cy + p.y); g.stroke();
        }
        if (dt) parts = parts.filter((p) => p.life > 0);
        if (calm || !on) { // static/paused: draw the swarm as dots so the frame isn't empty
          for (const p of parts) { g.fillStyle = col(p.h, 60, Math.max(0, p.life) * 0.8); g.fillRect(cx + p.x, cy + p.y, 2, 2); }
        }
      } else {
        g.fillStyle = `rgba(0,0,0,${calm ? 0.6 : Math.min(1, dt * 7)})`; g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = "lighter"; g.lineWidth = 2;
        for (let r = 0; r < 3; r++) { // oscilloscope rings
          const R = m * (0.16 + r * 0.08) * (1 + kick * 0.12), dir = r % 2 ? -1 : 1;
          g.strokeStyle = col([p0, p1, p2][r], 62, 0.75);
          g.beginPath();
          for (let j = 0; j < W; j++) {
            const ang = (j / W) * Math.PI * 2 + rot * dir, rr = R + wave[(j + r * 40) % W] * m * 0.1;
            g[j ? "lineTo" : "moveTo"](cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
          }
          g.closePath(); g.stroke();
        }
      }
    };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(frame); };
    addEventListener("resize", size);
    document.addEventListener("visibilitychange", vis);
    vis();
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", size); document.removeEventListener("visibilitychange", vis); };
  }, []);

  const canCapture = !!navigator.mediaDevices?.getDisplayMedia;
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-sm font-bold ${on ? "bg-white text-black" : "hover:bg-white/15"}`;
  return (
    <div ref={root} role="dialog" aria-modal aria-label="Visualizer" className="fixed inset-0 z-50 bg-black text-white">
      <canvas ref={canvas} aria-hidden className="absolute inset-0 size-full" />
      <audio ref={audio} src={hasPreview ? song.audio_file : undefined} crossOrigin="anonymous" preload="none" loop />
      <div className="absolute inset-x-0 top-0 flex flex-wrap items-center justify-end gap-2 p-4 opacity-60 transition focus-within:opacity-100 hover:opacity-100">
        <div role="group" aria-label="Visual mode" className="flex gap-1 rounded-full bg-black/60 p-1">
          {(Object.keys(MODES) as Mode[]).map((k, i) => (
            <button key={k} aria-pressed={mode === k} title={`${MODES[k]} (${i + 1})`} onClick={() => pick(k)} className={chip(mode === k)}>{MODES[k]}</button>
          ))}
        </div>
        {!previewing && canCapture && (
          <button aria-pressed={capture} title="Share this tab's audio so the visuals follow the real song (Chrome / Edge)" onClick={syncLive} className={`${chip(capture)} bg-black/60`}>
            {capture ? "Synced to audio" : "Sync to audio"}
          </button>
        )}
        <button aria-pressed={preview} disabled={!hasPreview || previewing} title={previewing ? "This song already plays as the 30-second preview" : hasPreview ? "Play the 30-second preview here and analyse its real audio, the full song pauses" : "No preview for this track"} onClick={togglePreview} className={`${chip(preview)} bg-black/60 disabled:opacity-40`}>
          Visualizer preview
        </button>
        <button aria-label="Toggle full screen" onClick={fullscreen} className={`${chip(false)} bg-black/60`}>⛶</button>
        <button ref={close} aria-label="Close visualizer" onClick={onClose} className={`${chip(false)} bg-black/60`}>✕</button>
      </div>
      {preview && <p role="status" className="absolute top-16 right-4 rounded bg-black/60 px-3 py-1 text-xs">Playing the 30-second preview · full song paused</p>}
      {err && <p role="alert" className="absolute top-16 left-4 rounded bg-red-500/30 px-3 py-1 text-xs">{err}</p>}
      <div className="pointer-events-none absolute bottom-6 left-6 max-w-[80vw] text-white/70">
        <p className="truncate text-2xl font-bold">{song.song_name}</p>
        <p className="truncate text-sm">{song.artist_name}</p>
        <p className="mt-1 text-xs text-white/40">{real === "capture" ? "Real audio · live from this tab" : real ? "Real audio · 30-second preview" : `Beat-synced · ${bpm} BPM${canCapture ? " · press Sync to audio for the real signal" : ""}`}</p>
      </div>
    </div>
  );
}
