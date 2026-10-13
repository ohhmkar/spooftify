import Link from "next/link";
import type { Song, ArtistSummary, AlbumDetails, PlaylistSummary, Playlist, Genre } from "@/lib/api";
import { api, getMe } from "@/lib/server";
import { Card, Shelf } from "@/components/ui";
import { TrackList } from "@/components/TrackList";

const TYPES = [["", "All"], ["songs", "Songs"], ["artists", "Artists"], ["albums", "Albums"], ["playlists", "Playlists"]];
const SORTS = [["", "Best match"], ["plays", "Most played"], ["name", "A–Z"], ["duration", "Longest"], ["year", "Newest"]];

export default async function Search({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = String(sp.q ?? "");
  const type = String(sp.type ?? "");
  const genre = String(sp.genre ?? "");
  const sort = String(sp.sort ?? "");
  const me = await getMe();
  const qs = new URLSearchParams({ q, genre, sort });
  const [res, mine, genres] = await Promise.all([
    api<{ songs: Song[]; artists: ArtistSummary[]; albums: AlbumDetails[]; playlists: PlaylistSummary[] }>(`/search?${qs}`),
    me ? api<Playlist[]>("/me/playlists") : [],
    api<Genre[]>("/Genre"),
  ]);
  // a genre only filters songs, so hide the other result types while it is set
  const show = (t: string) => (!type || type === t) && (!genre || t === "songs");
  const empty = !(show("songs") && res.songs.length) && !(show("artists") && res.artists.length) && !(show("albums") && res.albums.length) && !(show("playlists") && res.playlists.length);
  const link = (patch: Record<string, string>) => {
    const next = new URLSearchParams(Object.entries({ q, type, genre, sort, ...patch }).filter(([, v]) => v));
    return `/search?${next}`;
  };
  const chip = (on: boolean) => `shrink-0 rounded-full px-4 py-1.5 text-sm ${on ? "bg-white text-black" : "bg-raised hover:bg-white/15"}`;
  return (
    <div className="px-3 py-6">
      <h1 className="mb-4 px-3 text-3xl font-bold">{q ? `Results for “${q}”` : "Browse all"}</h1>
      <div className="mb-6 space-y-2 px-3">
        <div className="flex gap-2 overflow-x-auto pb-1">{TYPES.map(([v, l]) => <Link key={v} href={link({ type: v })} className={chip(type === v)}>{l}</Link>)}</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Link href={link({ genre: "" })} className={chip(!genre)}>All genres</Link>
          {genres.map((g) => <Link key={g._id} href={link({ genre: String(g._id) })} className={chip(genre === String(g._id))}>{g.genre_name}</Link>)}
        </div>
        {show("songs") && <div className="flex gap-2 overflow-x-auto pb-1">{SORTS.map(([v, l]) => <Link key={v} href={link({ sort: v })} className={chip(sort === v)}>Sort: {l}</Link>)}</div>}
      </div>
      {empty && <p className="px-3 text-muted">No results found.</p>}
      {show("songs") && !!res.songs.length && (
        <section className="mb-8">
          <h2 className="mb-2 px-3 text-2xl font-bold">Songs</h2>
          <TrackList songs={res.songs} playlists={mine} />
        </section>
      )}
      {show("artists") && !!res.artists.length && (
        <Shelf title="Artists">
          {res.artists.map((a) => <Card key={a.artist_id} href={`/artist/${a.artist_id}`} title={a.artist_name} image={a.image} subtitle="Artist" round />)}
        </Shelf>
      )}
      {show("albums") && !!res.albums.length && (
        <Shelf title="Albums">
          {res.albums.map((a) => <Card key={a.album_id} href={`/album/${a.album_id}`} title={a.album_name} image={a.cover} subtitle={`${a.release_year} • ${a.artist_name}`} />)}
        </Shelf>
      )}
      {show("playlists") && !!res.playlists.length && (
        <Shelf title="Playlists">
          {res.playlists.map((p) => <Card key={p.playlist_id} href={`/playlist/${p.playlist_id}`} title={p.playlist_name} image={p.cover} subtitle={`By ${p.owner}`} />)}
        </Shelf>
      )}
    </div>
  );
}
