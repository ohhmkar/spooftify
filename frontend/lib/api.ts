// server components call the API directly (lib/server.ts adds the login cookie); the browser goes through the /api rewrite
export const API = typeof window === "undefined" ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:1312/api") : "/api";

export type Me = { user_id: number; user_name: string; email: string };

export type Row = Record<string, unknown>;
export type Song = { song_id: number; song_name: string; duration: number; artist_id: number; artist_name: string; album_id?: number; album_name?: string; album_cover?: string; track_no?: number; genre_id?: number; genre_name?: string; release_year?: number; plays?: number; yt_views?: number; youtube_id?: string; _id?: string };
export type ArtistSummary = { artist_id: number; artist_name: string; country: string; image?: string; bio?: string; bio_url?: string; fans?: number; plays?: number; song_count: number; total_length: string };
export type PlaylistSummary = {
  playlist_id: number; playlist_name: string; owner: string; song_count: number; total_length: string; user_id: number; is_public: boolean; cover?: string;
};
export type AlbumDetails = { album_id: number; album_name: string; artist_id: number; artist_name: string; release_year: number; cover?: string; song_count: number; total_length: string };
export type Playlist = { _id: number; playlist_name: string; is_public: boolean; user_id: number; image?: string; shared?: boolean };
export type Genre = { _id: number; genre_name: string };
export type Follow = { kind: "artist" | "user" | "playlist"; target_id: number };

export async function api<T = Row[]>(path: string, init?: RequestInit & { body?: BodyInit | null }): Promise<T> {
  const res = await fetch(API + path, { cache: "no-store", headers: { "Content-Type": "application/json" }, ...init });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

// raw file upload: the file itself is the request body, its type the Content-Type
export const upload = (path: string, file: File) => api<Row>(path, { method: "PUT", body: file, headers: { "Content-Type": file.type } });

export const send = (method: string, path: string, body?: unknown) =>
  api<Row>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// YouTube serves a 16:9 thumbnail for any video id; no storage needed
export const thumb = (youtubeId?: string) => (youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg` : undefined);
export const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(n);
