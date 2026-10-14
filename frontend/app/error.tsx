"use client";

// a page whose data could not be loaded (API down, database unreachable) lands here instead of a blank crash
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="mb-2 text-3xl font-black">Something went wrong</h1>
      <p className="mb-6 text-muted">{error.message.includes("fetch failed") ? "The API is not reachable. Is the backend running?" : "This page could not be loaded."}</p>
      <button onClick={reset} className="rounded-full bg-white px-6 py-3 font-bold text-black hover:scale-105">Try again</button>
    </div>
  );
}
