"use client";
import { useRouter } from "next/navigation";
import { send, type PlaylistSummary } from "@/lib/api";
import { UploadButton } from "./Upload";
import { useToast } from "./Toast";

export function CreatePlaylist({ count, userId }: { count: number; userId: number }) {
  const router = useRouter();
  const toast = useToast();
  const create = () =>
    send("POST", "/Playlist", { playlist_name: `MY PLAYLIST #${count + 1}`, user_id: userId })
      .then((p) => router.push(`/playlist/${p._id}`))
      .then(() => router.refresh())
      .catch((e) => toast(e.message, true));
  return (
    <button onClick={create} className="flex items-center gap-2 rounded-full bg-raised px-4 py-2 text-sm font-bold hover:bg-white/15">
      <span className="text-xl leading-none">+</span>
      <span className="max-lg:sr-only">Create</span>
    </button>
  );
}

export function PlaylistActions({ p, collaborators }: { p: PlaylistSummary; collaborators: { user_id: number; user_name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const update = (changes: object) => send("PUT", `/Playlist/${p.playlist_id}`, changes).then(() => { router.refresh(); toast("Saved"); }).catch((e) => toast(e.message, true));

  const remove = () => {
    if (!confirm(`Delete "${p.playlist_name}"? This can't be undone.`)) return;
    // one transaction on the server: songs (logged to Removed_Songs), collaborators, follows, then the playlist, or nothing at all
    send("DELETE", `/playlists/${p.playlist_id}`)
      .then(() => { router.push("/"); router.refresh(); toast(`Deleted “${p.playlist_name}”`); })
      .catch((e) => toast(e.message, true));
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-5">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          update({ playlist_name: new FormData(e.currentTarget).get("name") });
        }}
      >
        <input name="name" defaultValue={p.playlist_name} maxLength={50} aria-label="Playlist name" className="rounded bg-white/10 px-3 py-2 text-sm" />
        <button className="rounded-full bg-accent px-4 text-sm font-bold text-black hover:scale-105">Rename</button>
      </form>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          update({ image: new FormData(e.currentTarget).get("image") || null });
        }}
      >
        <input name="image" type="url" defaultValue={p.cover?.startsWith("http") && !p.cover.includes("ytimg") ? p.cover : ""} placeholder="Cover image URL (blank = first song)" aria-label="Cover image URL" className="w-64 rounded bg-white/10 px-3 py-2 text-sm" />
        <button className="rounded-full bg-white/10 px-4 text-sm font-bold hover:bg-white/20">Set cover</button>
      </form>
      <UploadButton path={`/playlists/${p.playlist_id}/cover`} accept="image/*" label="Upload cover" />
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={p.is_public} onChange={(e) => update({ is_public: e.target.checked })} className="accent-accent" />
        Public
      </label>
      <button onClick={remove} className="ml-auto rounded-full border border-white/30 px-4 py-2 text-sm font-bold hover:border-red-400 hover:text-red-300">
        Delete playlist
      </button>
      <div className="flex w-full flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Collaborators:</span>
        {collaborators.map((c) => (
          <span key={c.user_id} className="flex items-center gap-1 rounded-full bg-white/10 py-1 pr-1 pl-3 text-sm">
            {c.user_name}
            <button aria-label={`Remove ${c.user_name}`} className="px-2 text-muted hover:text-white" onClick={() => send("DELETE", `/playlists/${p.playlist_id}/collaborators/${c.user_id}`).then(() => router.refresh()).catch((e) => toast(e.message, true))}>✕</button>
          </span>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = e.currentTarget;
            send("POST", `/playlists/${p.playlist_id}/collaborators`, { user_name: new FormData(f).get("user_name") }).then(() => { f.reset(); router.refresh(); toast("Collaborator added"); }).catch((e) => toast(e.message, true));
          }}
        >
          <input name="user_name" required placeholder="Add by username" aria-label="Collaborator username" className="w-40 rounded bg-white/10 px-3 py-1.5 text-sm" />
          <button className="rounded-full bg-white/10 px-4 text-sm font-bold hover:bg-white/20">Add</button>
        </form>
      </div>
    </div>
  );
}
