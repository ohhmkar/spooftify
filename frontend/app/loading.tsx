// shown while a page's data loads, so a click answers straight away instead of the old page freezing
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse px-6 py-8">
      <div className="mb-8 h-10 w-1/3 rounded bg-white/10" />
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className="size-10 shrink-0 rounded bg-white/10" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-white/10" />
            <div className="h-3 w-1/5 rounded bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
