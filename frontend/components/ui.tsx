import Link from "next/link";

// no image column in the schema, so art is a gradient derived from the name
export function hue(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function Cover({ name, src, round = false, className = "" }: { name: string; src?: string; round?: boolean; className?: string }) {
  const h = hue(name);
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  return (
    <div
      aria-hidden
      className={`grid aspect-square place-items-center overflow-hidden font-extrabold text-white/90 select-none ${round ? "rounded-full" : "rounded-md"} ${className}`}
      style={{ background: `linear-gradient(135deg, hsl(${h} 65% 45%), hsl(${(h + 60) % 360} 70% 22%))`, containerType: "inline-size" }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote art, no need for the image optimizer
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <span style={{ fontSize: "32cqi" }}>{initials}</span>
      )}
    </div>
  );
}

export function Card({ href, title, subtitle, image, round, action }: { href: string; title: string; subtitle: string; image?: string; round?: boolean; action?: React.ReactNode }) {
  return (
    <Link href={href} className="group relative w-[180px] shrink-0 rounded-lg p-3 transition hover:bg-white/[.07]">
      <Cover name={title} src={image} round={round} className="mb-3 shadow-lg shadow-black/40" />
      {action && <div className="absolute top-[132px] right-5 translate-y-2 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 focus-within:opacity-100">{action}</div>}
      <p className="truncate font-medium">{title}</p>
      <p className="line-clamp-2 text-sm text-muted">{subtitle}</p>
    </Link>
  );
}

export function Shelf({ title, href, wrap = false, children }: { title: string; href?: string; wrap?: boolean; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-baseline justify-between px-3">
        <h2 className="text-2xl font-bold">{title}</h2>
        {href && <Link href={href} className="text-sm font-bold text-muted hover:text-white hover:underline">Show all</Link>}
      </div>
      <div className={`-mx-1 flex pb-2 ${wrap ? "flex-wrap" : "overflow-x-auto [scrollbar-width:thin]"}`}>{children}</div>
    </section>
  );
}

export function Hero({ kind, title, meta, seed, image, round }: { kind: string; title: string; meta: React.ReactNode; seed: string; image?: string; round?: boolean }) {
  return (
    <header
      className="flex items-end gap-6 px-6 pt-16 pb-6"
      style={{ background: `linear-gradient(hsl(${hue(seed)} 45% 32%), hsl(${hue(seed)} 45% 18%))` }}
    >
      <Cover name={title} src={image} round={round} className="w-48 shrink-0 shadow-2xl shadow-black/50 max-sm:w-28" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{kind}</p>
        <h1 className="my-2 text-5xl font-black tracking-tight break-words max-sm:text-3xl lg:text-7xl">{title}</h1>
        <div className="text-sm text-white/80">{meta}</div>
      </div>
    </header>
  );
}
