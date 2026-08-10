import Link from 'next/link';
import { HomeSearchBar } from '@/components/home-search-bar';

const collageImages = [
  '/images/home-hero/gallery-wall-living-room.jpg',
  '/images/home-hero/neutral-living-room.jpg',
  '/images/home-hero/warm-pendant-living-room.jpg',
  '/images/home-hero/bright-kitchen-living-room.jpg',
];

export type HomeShortcut = {
  href: string;
  label: string;
};

export function HomeHero({
  shortcuts,
  initialQuery = '',
}: {
  shortcuts: HomeShortcut[];
  initialQuery?: string;
}) {
  return (
    <div className="bg-gradient-to-b from-home-hero-gradient-from to-home-hero-gradient-to">
      <div className="flex w-full flex-col items-center gap-12 px-6 py-12 lg:flex-row lg:items-start lg:justify-between lg:px-10 lg:py-8 xl:px-12">
        <div className="flex w-full max-w-2xl flex-col gap-6 lg:pt-20">
          <div className="flex items-center gap-2">
            <span className="h-px w-8 bg-surface-subtle-border" />
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary/70">
              Homefolio · Real Indian homes, only
            </span>
            <span className="h-px w-8 bg-surface-subtle-border" />
          </div>

          <h1 className="font-display text-5xl leading-none tracking-tight text-foreground sm:text-6xl xl:text-7xl">
            Inspire from <span className="text-primary">homes</span>
            <br />
            you&rsquo;ll love.
          </h1>

          <p className="max-w-md text-base leading-relaxed text-foreground/80">
            Type a feeling, a room, or a budget. We&rsquo;ll bring real Indian homes and the
            designers who built them closer to you.
          </p>

          <HomeSearchBar variant="hero" initialQuery={initialQuery} />

          {shortcuts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs uppercase tracking-[0.04em] text-primary/70">
                Start with
              </span>
              {shortcuts.map((shortcut) => (
                <Link
                  key={shortcut.href}
                  href={shortcut.href}
                  className="rounded-full border border-surface-subtle-border bg-card/70 px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                >
                  {shortcut.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <div className="hidden w-full max-w-lg grid-cols-2 gap-2 opacity-90 lg:grid">
          <div className="flex flex-col gap-2">
            <img
              src={collageImages[0]}
              alt=""
              className="aspect-[3/5] w-full rounded-xl object-cover"
            />
            <img
              src={collageImages[2]}
              alt=""
              className="aspect-[5/4] w-full rounded-xl object-cover"
            />
          </div>
          <div className="flex flex-col gap-2">
            <img
              src={collageImages[1]}
              alt=""
              className="aspect-[5/4] w-full rounded-xl object-cover"
            />
            <img
              src={collageImages[3]}
              alt=""
              className="aspect-[3/5] w-full rounded-xl object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
