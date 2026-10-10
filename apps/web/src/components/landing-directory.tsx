import { typography } from '@repo/ui/lib/typography';
import { cn } from '@repo/ui/lib/utils';
import Link from 'next/link';
import { Reveal } from '@repo/ui/components/reveal';
import type { FeedFacetOptions } from '@/components/feed-filters';
import type { BillingCatalogResponse } from '@repo/contracts';
import { EarlyBirdStrip, LandingPlans } from './landing-plans';

const groups = [
  { key: 'city', label: 'By city' },
  { key: 'room', label: 'By room' },
  { key: 'theme', label: 'By style' },
  { key: 'budgetBand', label: 'By budget' },
  { key: 'propertyType', label: 'By project type' },
  { key: 'scope', label: 'By scope' },
] as const;

export function LandingDirectory({ options }: { options: FeedFacetOptions }) {
  const available = groups.filter(({ key }) => options[key]?.length);
  if (available.length === 0) return null;
  return (
    <section
      className="landing-reveal px-5 py-10 sm:px-8 lg:px-12"
      aria-labelledby="browse-heading"
    >
      <h2 id="browse-heading" className={typography.headingH2}>
        Explore homes <span className="text-primary">across India</span>
      </h2>
      <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 xl:grid-cols-6">
        {available.map(({ key, label }) => (
          <nav id={`browse-by-${key}`} key={key} aria-label={label} className="scroll-mt-24">
            <h3 className={cn(typography.monoMd, 'mb-3 uppercase text-muted-foreground')}>
              {label}
            </h3>
            <ul className="space-y-2">
              {options[key]!.slice(0, 6).map((option) => (
                <li key={option.slug}>
                  <Link
                    href={`/?${key}=${encodeURIComponent(option.slug)}`}
                    className={cn(
                      typography.labelMd,
                      'text-foreground-secondary hover:text-primary hover:underline',
                    )}
                  >
                    {option.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </section>
  );
}

export function LandingDesignerCallout({ catalog }: { catalog: BillingCatalogResponse | null }) {
  return (
    <section
      id="for-designers"
      aria-labelledby="designers-heading"
      className="border-y border-border pb-8 text-center"
    >
      <EarlyBirdStrip offer={catalog?.earlyBird ?? null} />
      <div className="px-5 pt-20 sm:px-8 lg:px-12">
        <p
          className={cn(
            typography.monoXs,
            'mx-auto flex w-fit items-center gap-2 rounded-full bg-secondary px-3.5 py-1.5 uppercase text-secondary-foreground',
          )}
        >
          <img src="/images/landing/pricing-dot.svg" alt="" />
          For designers &amp; studios
        </p>
        <Reveal>
          <h2
            id="designers-heading"
            className={cn(typography.designerHero, 'mx-auto mt-5 max-w-[1250px]')}
          >
            <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:gap-x-4">
              <span>Your best</span>
              <img
                src="/images/landing/designer-headline.jpg"
                alt=""
                width={132}
                height={68}
                loading="lazy"
                className="h-[1.0625em] w-[2.0625em] rotate-4 rounded-full object-cover shadow-sm"
              />
              <span>work, in front of</span>
            </span>
            <span className="mt-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <span className="flex max-w-full flex-wrap items-center justify-center gap-3.5 sm:flex-nowrap">
                <span aria-hidden="true" className="flex -space-x-3 sm:-space-x-4">
                  {[1, 2, 3].map((portrait) => (
                    <span
                      key={portrait}
                      className="relative size-9 overflow-hidden rounded-full border-[3px] border-background sm:size-12 xl:size-14"
                    >
                      <img
                        src={`/images/landing/designer-portrait-${portrait}.jpg`}
                        alt=""
                        width={56}
                        height={56}
                        loading="lazy"
                        className="absolute left-[-30.65%] top-[-9.68%] size-[161.29%] max-w-none"
                      />
                    </span>
                  ))}
                </span>
                <span className="relative isolate">
                  <span
                    aria-hidden="true"
                    className="absolute -inset-x-2 bottom-[0.16em] -z-10 h-[0.4375em] -rotate-2 rounded-lg bg-primary-soft/60"
                  />
                  homeowners
                </span>
              </span>
              <span>ready to hire.</span>
            </span>
          </h2>
        </Reveal>
        <p className={cn(typography.bodyMd, 'mx-auto mt-6 max-w-xl text-muted-foreground')}>
          Share your projects, build your portfolio and connect with homeowners looking for their
          next designer.
        </p>
        <LandingPlans catalog={catalog} />
      </div>
    </section>
  );
}
