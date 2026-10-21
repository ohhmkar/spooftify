"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { art } from "@/lib/api";
import type { Ctx } from "./Player";

// everything outside the page that controls the player: keyboard shortcuts, the OS media session, the tab title
export function usePlayerShortcuts(ctx: Ctx) {
  const ref = useRef(ctx);
  useEffect(() => {
    ref.current = ctx;
  });
  const { current, playing } = ctx;
  const path = usePathname();

  // Space play / pause, ←/→ seek 5 s, Shift+↑/↓ volume, M mute, / focus search. Ignored while typing (arrows alone stay free to scroll the page)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || t.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      const c = ref.current;
      if (e.key === "/") {
        e.preventDefault();
        const box = document.querySelector<HTMLInputElement>("input[type=search]");
        return box && (box.focus(), box.select());
      }
      if (!c.current) return;
      const arrow = e.key === "ArrowLeft" || e.key === "ArrowRight" || (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown"));
      if (e.code === "Space" && !e.repeat && !t.closest("button, a, summary")) { // Space already means something on a button / link
        e.preventDefault();
        c.toggle();
      } else if (arrow && !t.closest("[role=slider], [role=separator]")) { // those handle their own arrows
        e.preventDefault();
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") c.seek(Math.max(0, Math.min(c.duration || c.current.duration, c.time + (e.key === "ArrowRight" ? 5 : -5))));
        else c.setVolume(Math.max(0, Math.min(100, c.volume + (e.key === "ArrowUp" ? 5 : -5))));
      } else if (e.key === "m") c.toggleMute();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);

  // lock screen / media keys / headphone buttons
  useEffect(() => {
    if (!current || !("mediaSession" in navigator)) return;
    const cover = art(current);
    navigator.mediaSession.metadata = new MediaMetadata({ title: current.song_name, artist: current.artist_name, album: current.album_name ?? "", artwork: cover ? [{ src: cover }] : [] });
  }, [current]);
  useEffect(() => {
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = current ? (playing ? "playing" : "paused") : "none";
  }, [current, playing]);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const h: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => !ref.current.playing && ref.current.toggle()],
      ["pause", () => ref.current.playing && ref.current.toggle()],
      ["previoustrack", () => ref.current.skip(-1)],
      ["nexttrack", () => ref.current.skip(1)],
      ["seekto", (d) => d.seekTime != null && ref.current.seek(d.seekTime)],
    ];
    h.forEach(([a, f]) => navigator.mediaSession.setActionHandler(a, f));
    return () => h.forEach(([a]) => navigator.mediaSession.setActionHandler(a, null));
  }, []);

  // tab title; `path` is a dependency because Next rewrites the title on every navigation
  useEffect(() => {
    if (current) document.title = `${playing ? "▶ " : ""}${current.song_name} · ${current.artist_name}`;
  }, [current, playing, path]);
}
