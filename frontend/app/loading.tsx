// shown while a page's data loads, so a click answers straight away instead of the old page freezing
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="grid h-full min-h-64 place-items-center">
      <div className="size-10 animate-spin rounded-full border-4 border-white/20 border-t-accent" />
    </div>
  );
}
