"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { store } from "@/lib/store";

const RECENT = "spoot-recent";
const recent = () => store.get<string[]>(RECENT, []);

// the top search field: searches as you type (debounced), shows what you searched for on the results page, remembers recent searches
export function SearchBox() {
  const q = useSearchParams().get("q") ?? "";
  const router = useRouter();
  const onSearch = usePathname() === "/search";
  const [past, setPast] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (input.current && document.activeElement !== input.current) input.current.value = q; // back / forward or a chip click; never overwrite what is being typed
  }, [q]);
  const go = (v: string) => {
    v = v.trim();
    if (!v && !onSearch) return;
    router[onSearch ? "replace" : "push"](v ? `/search?q=${encodeURIComponent(v)}` : "/search");
  };
  const remember = (v: string) => {
    v = v.trim();
    if (v.length < 2) return;
    const next = [v, ...recent().filter((r) => r !== v)].slice(0, 8);
    store.set(RECENT, next);
    setPast(next);
  };
  return (
    <form
      role="search" className="flex h-12 w-full min-w-0 max-w-md items-center gap-3 rounded-full bg-raised px-4 focus-within:ring-2 focus-within:ring-white"
      onSubmit={(e) => { e.preventDefault(); clearTimeout(timer.current); remember(input.current!.value); go(input.current!.value); }} // no full page load, so the music keeps playing
    >
      <svg viewBox="0 0 24 24" className="size-6 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
      </svg>
      <input
        ref={input} name="q" type="search" defaultValue={q} list="recent-searches" autoComplete="off" placeholder="What do you want to play?  ( / )" aria-label="Search"
        className="w-full bg-transparent outline-none placeholder:text-muted"
        onChange={(e) => { clearTimeout(timer.current); timer.current = setTimeout(() => go(e.target.value), 300); }}
        onFocus={() => setPast(recent())} onBlur={(e) => remember(e.target.value)}
      />
      <datalist id="recent-searches">{past.map((r) => <option key={r} value={r} />)}</datalist>
    </form>
  );
}
