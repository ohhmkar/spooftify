"use client";
import { useState } from "react";
import { send, SONG_DRAG } from "@/lib/api";
import { useAction } from "./useAction";

// a sidebar playlist you can edit: drop a song row from any TrackList on it to add the song
export function PlaylistDrop({ id, name, children }: { id: number; name: string; children: React.ReactNode }) {
  const run = useAction();
  const [over, setOver] = useState(false);
  const ours = (e: React.DragEvent) => e.dataTransfer.types.includes(SONG_DRAG);
  return (
    <li
      className={`rounded-md ${over ? "bg-accent/20 ring-2 ring-accent" : ""}`}
      onDragOver={(e) => { if (!ours(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!ours(e)) return;
        e.preventDefault();
        const s = JSON.parse(e.dataTransfer.getData(SONG_DRAG)) as { song_id: number; song_name: string };
        run(send("POST", `/playlists/${id}/songs`, { song_id: s.song_id }), `Added “${s.song_name}” to ${name}`);
      }}
    >
      {children}
    </li>
  );
}
