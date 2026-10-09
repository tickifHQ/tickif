'use client';

import { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { BillingCatalogResponse } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';

export function EarlyBirdStrip({ offer }: { offer: BillingCatalogResponse['earlyBird'] }) {
  const [paused, setPaused] = useState(false);
  if (!offer) return null;
  const labels = [
    'Early bird',
    `${offer.months} months free on any paid plan`,
    'Join by 31 Dec 2026',
    'No card needed',
    'New paid customers',
  ];
  return (
    <div
      className="landing-marquee relative overflow-hidden bg-primary text-primary-foreground"
      aria-label="Early-bird offer"
      data-motion-paused={paused}
    >
      <p className="sr-only">
        Early bird: {offer.months} months free on either paid plan. Join by 31 December 2026. No
        card needed. New paid customers only.
      </p>
      <div
        aria-hidden="true"
        className="landing-marquee-track flex w-max font-mono text-[10px] font-medium uppercase tracking-wider"
      >
        {[0, 1].map((repeat) => (
          <div
            key={repeat}
            className="flex min-h-11 min-w-[100vw] shrink-0 items-center justify-around gap-6 pr-6"
          >
            {labels.map((label) => (
              <span key={label} className="flex shrink-0 items-center gap-6 whitespace-nowrap">
                {label}
                <img src="/images/landing/pricing-ticker-sparkles.svg" alt="" />
              </span>
            ))}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={paused ? 'Resume animations' : 'Pause animations'}
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
        className="landing-motion-control absolute right-1 top-1 size-9 rounded-full bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground"
      >
        {paused ? (
          <Play className="size-3.5" aria-hidden />
        ) : (
          <Pause className="size-3.5" aria-hidden />
        )}
      </Button>
    </div>
  );
}
