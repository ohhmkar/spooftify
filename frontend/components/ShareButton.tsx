"use client";
import { useToast } from "./Toast";

// copies a link to this page; phones get the system share sheet instead
export function ShareButton({ title }: { title: string }) {
  const toast = useToast();
  const share = async () => {
    const url = location.origin + location.pathname;
    if (navigator.share && matchMedia("(hover: none)").matches) return navigator.share({ title, url }).catch(() => {}); // dismissing the sheet rejects
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast(`Copy this link: ${url}`, true); // no clipboard permission (plain http on another host, iframe)
    }
  };
  return (
    <button onClick={share} aria-label={`Share ${title}`} title="Copy link"
      className="grid size-10 place-items-center rounded-full border border-white/40 text-muted hover:scale-105 hover:border-white hover:text-white">
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M6.5 9.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9M9.5 6.5a3 3 0 0 0-4.2 0L2.7 9.1a3 3 0 0 0 4.2 4.2l.9-.9" /></svg>
    </button>
  );
}
