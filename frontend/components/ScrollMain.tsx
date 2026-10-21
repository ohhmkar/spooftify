"use client";
/* eslint-disable react-hooks/refs -- reading the scroll position during render is the only moment the old page is still on screen */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// <main> is the scroll container and lives in the layout, so Next never restores its scroll: remember it per page, bring it back on Back / Forward
export function ScrollMain({ children, className }: { children: React.ReactNode; className?: string }) {
  const el = useRef<HTMLElement>(null);
  const path = usePathname();
  const shown = useRef(path);
  const saved = useRef(new Map<string, number>());
  const back = useRef(false);
  // during render the old page is still on screen, so this reads the position it was left at
  if (shown.current !== path) {
    if (el.current) saved.current.set(shown.current, el.current.scrollTop);
    shown.current = path;
  }
  useEffect(() => {
    const pop = () => (back.current = true);
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const y = back.current ? (saved.current.get(path) ?? 0) : 0;
    back.current = false;
    let n = 0, raf = 0;
    const go = () => {
      if (!el.current) return;
      el.current.scrollTop = y;
      if (Math.abs(el.current.scrollTop - y) > 2 && n++ < 60) raf = requestAnimationFrame(go); // the page may still be streaming in
    };
    go();
    return () => cancelAnimationFrame(raf);
  }, [path]);
  return <main ref={el} className={className}>{children}</main>;
}
