"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, send } from "@/lib/api";

// liked song ids of the logged-in user, shared by every heart on the page
const LikesCtx = createContext<{ liked: Set<number>; toggle: (id: number) => void }>({ liked: new Set(), toggle: () => {} });

export function LikesProvider({ loggedIn, children }: { loggedIn: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const [liked, setLiked] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (loggedIn) api<number[]>("/me/likes").then((ids) => setLiked(new Set(ids))).catch(() => {});
  }, [loggedIn]);

  const toggle = (id: number) => {
    if (!loggedIn) return router.push("/login");
    const on = !liked.has(id);
    setLiked((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    }); // optimistic
    send(on ? "PUT" : "DELETE", `/like/${id}`).then(() => router.refresh()).catch((e) => alert(e.message));
  };
  return <LikesCtx.Provider value={{ liked, toggle }}>{children}</LikesCtx.Provider>;
}

export function LikeButton({ id, className = "" }: { id: number; className?: string }) {
  const { liked, toggle } = useContext(LikesCtx);
  const on = liked.has(id);
  return (
    <button aria-label={on ? "Remove from Liked Songs" : "Save to Liked Songs"} aria-pressed={on} onClick={() => toggle(id)}
      className={`grid size-8 shrink-0 place-items-center ${on ? "text-accent" : "text-muted hover:text-white"} ${className}`}>
      <svg viewBox="0 0 16 16" className="size-4" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4"><path d="M8 14S1.5 10 1.5 5.8A3.3 3.3 0 0 1 8 4.4a3.3 3.3 0 0 1 6.5 1.4C14.5 10 8 14 8 14Z" /></svg>
    </button>
  );
}
