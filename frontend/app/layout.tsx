import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { PlayerProvider, NowPlaying, PlayerBar } from "@/components/Player";
import { LikesProvider } from "@/components/Likes";
import { LogoutButton } from "@/components/Auth";
import { MobileNav } from "@/components/MobileNav";
import { getMe } from "@/lib/server";
import "./globals.css";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Spootify — DBMS Mini Project",
  description: "Spootify, a Spotify clone on MongoDB: tables, views and triggers from spotify_miniproject.sql",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const me = await getMe();
  return (
    <html lang="en" className={`${figtree.variable} antialiased`}>
      <body className="flex h-dvh flex-col font-sans">
        <LikesProvider key={me?.user_id ?? 0} loggedIn={!!me}>
        <PlayerProvider>
        <nav className="flex h-16 shrink-0 items-center gap-2 px-4">
          <Link href="/" aria-label="Home" className="mr-2 grid size-10 shrink-0 place-items-center rounded-full bg-white text-black">
            <svg viewBox="0 0 24 24" className="size-8" fill="currentColor" aria-hidden>
              <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm5.5 17.3a.75.75 0 0 1-1 .25c-2.8-1.7-6.4-2.1-10.6-1.2a.75.75 0 0 1-.3-1.5c4.6-1 8.6-.6 11.7 1.4.4.2.5.7.2 1Zm1.5-3.3a.94.94 0 0 1-1.3.3c-3.2-2-8.1-2.5-11.9-1.4a.94.94 0 1 1-.5-1.8c4.3-1.3 9.7-.7 13.4 1.6.4.3.6.9.3 1.3Zm.1-3.4C15.3 8.3 8.9 8.1 5.2 9.2a1.1 1.1 0 1 1-.6-2.2c4.3-1.3 11.3-1 15.7 1.6a1.1 1.1 0 0 1-1.2 2Z" />
            </svg>
          </Link>
          <Link href="/" aria-label="Home" className="grid size-12 shrink-0 place-items-center rounded-full bg-raised hover:scale-105 max-md:hidden">
            <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden><path d="M12 3 2 11h3v10h6v-6h2v6h6V11h3z" /></svg>
          </Link>
          <form action="/search" className="flex h-12 w-full min-w-0 max-w-md items-center gap-3 rounded-full bg-raised px-4 focus-within:ring-2 focus-within:ring-white">
            <svg viewBox="0 0 24 24" className="size-6 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
            </svg>
            <input name="q" type="search" placeholder="What do you want to play?" aria-label="Search" className="w-full bg-transparent outline-none placeholder:text-muted" />
          </form>
          <div className="ml-auto flex items-center gap-2 max-md:hidden">
          <Link href="/stats" className="shrink-0 rounded-full px-4 py-3 font-bold text-muted hover:scale-105 hover:text-white">
            Stats
          </Link>
          <Link href="/db" className="shrink-0 rounded-full px-4 py-3 font-bold text-muted hover:scale-105 hover:text-white">
            DB Console
          </Link>
          {me ? (
            <>
              <Link href={`/user/${me.user_id}`} className="shrink-0 rounded-full bg-raised px-4 py-3 font-bold hover:scale-105">{me.user_name}</Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/signup" className="shrink-0 rounded-full px-4 py-3 font-bold text-muted hover:scale-105 hover:text-white">Sign up</Link>
              <Link href="/login" className="shrink-0 rounded-full bg-white px-6 py-3 font-bold text-black hover:scale-105">Log in</Link>
            </>
          )}
          </div>
        </nav>
        <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-y-auto rounded-lg bg-panel">{children}</main>
          <NowPlaying />
        </div>
        <PlayerBar />
        <MobileNav userId={me?.user_id} />
        </PlayerProvider>
        </LikesProvider>
      </body>
    </html>
  );
}
