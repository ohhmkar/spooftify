"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { UploadButton } from "./Upload";
import { useLoggedIn } from "./Likes";

// Spotify-style Canvas: a short muted looping video kept in GridFS; the <video> fetches it with HTTP Range requests
export function Canvas({ songId }: { songId: number }) {
  const loggedIn = useLoggedIn();
  const [id, setId] = useState<string>();
  const load = useCallback(() => void api<{ canvas_id?: string }>(`/Songs/${songId}`).then((s) => setId(s.canvas_id)).catch(() => {}), [songId]);
  useEffect(load, [load]);
  return (
    <div className="flex flex-col items-start gap-2">
      {id && <video key={id} src={`/api/canvas/${id}`} autoPlay muted loop playsInline className="aspect-[9/16] max-h-96 w-full rounded-lg bg-black object-cover" />}
      {loggedIn && <UploadButton path={`/songs/${songId}/canvas`} accept="video/mp4,video/webm" label={id ? "Replace canvas" : "Add canvas"} onDone={load} />}
    </div>
  );
}
