import { getMe } from "@/lib/server";
import { api } from "@/lib/server";
import type { Playlist } from "@/lib/api";
import { CreatePlaylist } from "./PlaylistActions";
import { Library } from "./Library";

export async function Sidebar() {
  const me = await getMe();
  const mine = me ? await api<Playlist[]>("/me/playlists").catch(() => []) : [];
  return (
    <aside className="flex w-80 shrink-0 flex-col rounded-lg bg-panel max-lg:w-20 max-md:hidden">
      <div className="flex items-center justify-between p-4 pl-6">
        <h2 className="font-bold max-lg:sr-only">Your Library</h2>
        {me && <CreatePlaylist count={mine.filter((p) => !p.shared).length} userId={me.user_id} />}
      </div>
      <div className="flex-1 overflow-y-auto"><Library /></div>
    </aside>
  );
}
