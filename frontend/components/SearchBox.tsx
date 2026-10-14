"use client";
import { useSearchParams } from "next/navigation";

// the top search field: shows what you searched for on the results page (and is empty everywhere else)
export function SearchBox() {
  const q = useSearchParams().get("q") ?? "";
  return (
    <form action="/search" role="search" className="flex h-12 w-full min-w-0 max-w-md items-center gap-3 rounded-full bg-raised px-4 focus-within:ring-2 focus-within:ring-white">
      <svg viewBox="0 0 24 24" className="size-6 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
      </svg>
      <input key={q} name="q" type="search" defaultValue={q} placeholder="What do you want to play?" aria-label="Search" className="w-full bg-transparent outline-none placeholder:text-muted" />
    </form>
  );
}
