import { getMe, getLibrary } from "@/lib/server";
import { CreatePlaylist } from "@/components/PlaylistActions";
import { Library } from "@/components/Library";
import Link from "next/link";

// the sidebar does not fit on phones, so the same list gets its own page
export default async function LibraryPage() {
  const me = await getMe();
  const mine = me ? ((await getLibrary())?.playlists ?? []) : [];
  return (
    <div className="py-4">
      <div className="flex items-center justify-between px-4 pb-2">
        <h1 className="text-2xl font-bold">Your Library</h1>
        {me && <CreatePlaylist count={mine.filter((p) => !p.shared).length} userId={me.user_id} />}
      </div>
      <Library wide />
      {me && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 pt-4 text-sm text-muted">
          <Link href="/feed" className="hover:text-white hover:underline">Feed</Link>
          <Link href="/stats/you" className="hover:text-white hover:underline">Your listening stats</Link>
          <Link href={`/user/${me.user_id}`} className="hover:text-white hover:underline">View profile ({me.user_name})</Link>
        </div>
      )}
    </div>
  );
}
