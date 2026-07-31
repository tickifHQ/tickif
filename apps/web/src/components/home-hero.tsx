import { mockProjects, feedImageUrl } from '@/lib/mock-projects';

const quickStarts = [
  'Scandinavian apartment',
  'Traditional bedroom',
  'Pooja room',
  '3BHK under 15L',
  'Walnut & cane',
  'Industrial loft',
  'Maximalist colour',
];

const collage = mockProjects.slice(0, 4).map((p) => p.seed);

export function HomeHero() {
  return (
    <div className="bg-card">
      <div className="mx-auto flex w-full max-w-[1512px] flex-col items-center gap-12 px-6 py-12 lg:flex-row lg:justify-between lg:px-10 lg:py-12">
        <div className="flex w-full max-w-xl flex-col gap-6">
          <div className="flex items-center gap-2">
            <span className="h-px w-8 bg-[#c7d1c8]" />
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#88a399]">
              Homefolio · Real Indian homes, only
            </span>
            <span className="h-px w-8 bg-[#c7d1c8]" />
          </div>

          <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-[#18181b] sm:text-6xl">
            Inspire from <span className="text-primary">homes</span>
            <br />
            you&rsquo;ll love.
          </h1>

          <p className="max-w-md text-base leading-relaxed text-[#3f4a44]">
            Type a feeling, a room, a budget &mdash; anything. We&rsquo;ll put 12,400 real Indian
            homes between you and a designer who built one.
          </p>

          <form className="w-full" role="search">
            <div className="flex items-center gap-3 rounded-xl border border-[#2d5a3d]/35 bg-white py-1 pl-3.5 pr-1.5 shadow-[0_16px_48px_0_rgba(45,90,61,0.15)]">
              <svg
                className="size-4 shrink-0 text-muted-foreground"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
              >
                <circle cx="7" cy="7" r="5" />
                <path d="m11 11 3 3" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                placeholder="Search by city, style, budget, room type…"
                aria-label="Search homes"
                className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#0e121b] px-3.5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0e121b]/90"
              >
                Explore
                <span aria-hidden>→</span>
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.04em] text-[#8a9b8f]">
              Start with
            </span>
            {quickStarts.map((label) => (
              <button
                key={label}
                type="button"
                className="rounded-full border border-[#cdd6d0] bg-white/70 px-4 py-2 text-[13px] font-medium text-[#3f4a44] transition-colors hover:bg-white"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="hidden w-full max-w-[605px] grid-cols-2 gap-4 opacity-90 lg:grid">
          <div className="flex flex-col gap-4">
            <img
              src={feedImageUrl(collage[0] ?? 'a', 520)}
              alt=""
              className="aspect-[3/5] w-full rounded-[10px] object-cover"
            />
            <img
              src={feedImageUrl(collage[2] ?? 'c', 320)}
              alt=""
              className="aspect-[5/4] w-full rounded-[10px] object-cover"
            />
          </div>
          <div className="flex flex-col gap-4">
            <img
              src={feedImageUrl(collage[1] ?? 'b', 320)}
              alt=""
              className="aspect-[5/4] w-full rounded-[10px] object-cover"
            />
            <img
              src={feedImageUrl(collage[3] ?? 'd', 520)}
              alt=""
              className="aspect-[3/5] w-full rounded-[10px] object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
