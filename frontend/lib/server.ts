// Server-component side of the API client: same as lib/api.ts but forwards the visitor's login cookie.
import { cache } from "react";
import { cookies } from "next/headers";
import { API, type Me, type Row, type LibraryData } from "./api";

export async function api<T = Row[]>(path: string): Promise<T> {
  const res = await fetch(API + path, { cache: "no-store", headers: { cookie: (await cookies()).toString() } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

// null = logged out (or API offline)
export const getMe = cache(() => api<Me | null>("/me").catch(() => null)); // layout, sidebar and page share one request
export const getLibrary = cache(() => api<LibraryData>("/me/library").catch(() => null)); // null = API offline
