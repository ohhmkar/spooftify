"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// phones: the sidebar and the top-right links are hidden, so these four tabs replace them
export function MobileNav({ userId }: { userId?: number }) {
  const path = usePathname();
  const tabs = [
    ["/", "Home", "M12 3 2 11h3v10h6v-6h2v6h6V11h3z"],
    ["/search", "Search", "M10 3a7 7 0 1 0 4.2 12.6l5.1 5.1 1.4-1.4-5.1-5.1A7 7 0 0 0 10 3Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"],
    ["/library", "Library", "M4 4h3v16H4zm6 0h3v16h-3zm6.5.5 2.9-.8 3.6 15.6-2.9.8z"],
    ["/stats", "Stats", "M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z"],
    userId ? [`/user/${userId}`, "Profile", "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5Z"] : ["/login", "Log in", "M10 4v3H4v10h6v3l8-8zm0 0"],
  ];
  return (
    <nav aria-label="Main" className="flex h-14 shrink-0 items-center justify-around border-t border-white/10 bg-black md:hidden">
      {tabs.map(([href, label, d]) => (
        <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 px-3 text-[11px] ${path === href ? "text-white" : "text-muted"}`}>
          <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden><path d={d} /></svg>
          {label}
        </Link>
      ))}
    </nav>
  );
}
