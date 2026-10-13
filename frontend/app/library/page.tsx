import { getMe, api } from "@/lib/server";
import type { Playlist } from "@/lib/api";
import { CreatePlaylist } from "@/components/PlaylistActions";
import { Library } from "@/components/Library";
import Link from "next/link";

// the sidebar does not fit on phones, so the same list gets its own page
export default async function LibraryPage() {
  const me = await getMe();
  const mine = me ? await api<Playlist[]>("/me/playlists").catch(() => []) : [];
  return (
    <div className="py-4">
      <div className="flex items-center justify-between px-4 pb-2">
        <h1 className="text-2xl font-bold">Your Library</h1>
        {me && <CreatePlaylist count={mine.filter((p) => !p.shared).length} userId={me.user_id} />}
      </div>
      <Library wide />
      {me && <div className="px-4 pt-4"><Link href={`/user/${me.user_id}`} className="text-sm text-muted hover:text-white hover:underline">View profile ({me.user_name})</Link></div>}
    </div>
  );
}
