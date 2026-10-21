"use client";
import { useEffect, useRef, type CSSProperties } from "react";
import { usePlayer } from "./Player";
import { store } from "@/lib/store";

// Drag handle that writes a CSS variable (--sb, --np, --pb, --pl, --pr) which a pane's width / height reads, and remembers it.
// side says which pane it resizes: left / right = the sibling before / after it, top = its parent (bar height, dragged upwards),
// col-l / col-r = the [data-col] column of the parent. Double-click resets; arrow keys nudge.
const SIDES = {
  left: { dir: 1, y: false, find: (h: HTMLElement) => h.previousElementSibling },
  right: { dir: -1, y: false, find: (h: HTMLElement) => h.nextElementSibling },
  top: { dir: -1, y: true, find: (h: HTMLElement) => h.parentElement },
  "col-l": { dir: 1, y: false, find: (h: HTMLElement) => h.parentElement?.querySelector('[data-col="l"]') },
  "col-r": { dir: -1, y: false, find: (h: HTMLElement) => h.parentElement?.querySelector('[data-col="r"]') },
};

// px = null resets to the CSS default
export function setPane(v: string, px: number | null) {
  if (px == null) document.documentElement.style.removeProperty(v);
  else document.documentElement.style.setProperty(v, `${px}px`);
  store.set(v, px ?? undefined);
}

export function Resizer({ v, side, label, needsSong, min = 160, max = 560, className = "group z-10 -mx-2 w-2 shrink-0 cursor-col-resize touch-none max-lg:hidden", style }: {
  v: string; side: keyof typeof SIDES; label: string; needsSong?: boolean; min?: number; max?: number; className?: string; style?: CSSProperties;
}) {
  const { current } = usePlayer();
  const drag = useRef<{ p: number; w: number } | null>(null);
  const { dir, y, find } = SIDES[side];
  const set = (px: number) => setPane(v, Math.min(max, Math.max(min, px)));
  const size = (h: HTMLElement) => { const el = find(h) as HTMLElement | null; return (y ? el?.offsetHeight : el?.offsetWidth) ?? 0; };
  useEffect(() => {
    const px = store.get<number | null>(v, null);
    if (px) document.documentElement.style.setProperty(v, `${px}px`);
  }, [v]);
  if (needsSong && !current) return null;
  return (
    <div
      role="separator" aria-orientation={y ? "horizontal" : "vertical"} aria-label={`Resize ${label}`} tabIndex={0} className={className} style={style}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { p: y ? e.clientY : e.clientX, w: size(e.currentTarget) }; }}
      onPointerMove={(e) => drag.current && set(drag.current.w + ((y ? e.clientY : e.clientX) - drag.current.p) * dir)}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => setPane(v, null)}
      onKeyDown={(e) => {
        const d = e.key === (y ? "ArrowUp" : "ArrowLeft") ? -16 : e.key === (y ? "ArrowDown" : "ArrowRight") ? 16 : 0;
        if (d) { e.preventDefault(); set(size(e.currentTarget) + d * dir); }
      }}
    >
      <div className={`${y ? "my-auto h-0.5 w-full" : "mx-auto h-full w-0.5"} rounded bg-transparent group-hover:bg-white/30 group-focus-visible:bg-white/50 group-active:bg-accent`} />
    </div>
  );
}
