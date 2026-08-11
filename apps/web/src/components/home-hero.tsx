import { SearchCombobox } from '@/components/search-combobox';
import { QuickStartChips } from '@/components/quick-start-chips';

const collageImages = [
  '/images/home-hero/gallery-wall-living-room.jpg',
  '/images/home-hero/neutral-living-room.jpg',
  '/images/home-hero/warm-pendant-living-room.jpg',
  '/images/home-hero/bright-kitchen-living-room.jpg',
];

export function HomeHero() {
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
            Type a feeling, a room, a budget &mdash; anything. We&rsquo;ll put 12,400 real Indian
            homes between you and a designer who built one.
          </p>

          <SearchCombobox variant="hero" />

          <QuickStartChips />
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
