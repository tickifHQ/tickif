import { typography } from '@repo/ui/lib/typography';
import { cn } from '@repo/ui/lib/utils';
import Link from 'next/link';
import type { BillingCatalogResponse } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Reveal } from '@repo/ui/components/reveal';
import { Card } from '@repo/ui/components/card';
import { formatCurrency } from '@/lib/plan-config';

export { EarlyBirdStrip } from './early-bird-strip';

export function LandingPlans({ catalog }: { catalog: BillingCatalogResponse | null }) {
  if (!catalog?.plans.length)
    return (
      <div className="mt-12 text-center" role="status">
        <p className="text-muted-foreground">
          Plans are temporarily unavailable. Please try again shortly.
        </p>
        <Button asChild className="mt-4">
          <Link href="/designer/plan-billing/subscribe">View plans</Link>
        </Button>
      </div>
    );
  return (
    <div className="mt-12 text-left">
      <div className="grid gap-5 lg:grid-cols-3" aria-label="Monthly plans">
        {catalog.plans.map((plan, index) => {
          const highlighted = plan.tier === 'professional_plus';
          const offer = plan.amountPaise > 0 ? catalog.earlyBird : null;
          const href = offer
            ? `/early-bird?plan=${plan.tier}`
            : plan.tier === 'hobby'
              ? '/login?mode=designer'
              : '/designer/plan-billing/subscribe';
          return (
            <Reveal key={plan.tier} delay={index * 100} className="min-w-0">
              <Card
                radius="3xl"
                className={`relative flex h-full min-w-0 flex-col border-0 p-7 sm:p-8 ${highlighted ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : plan.tier === 'corporate' ? 'bg-secondary text-foreground shadow-none' : 'bg-muted text-foreground shadow-none'}`}
              >
                {highlighted ? (
                  <span className="landing-hanging absolute -top-2.5 right-12 z-10 flex rotate-6 items-center gap-1.5 rounded-lg bg-primary-soft px-2.5 py-1.5 font-mono text-[10px] font-medium uppercase leading-3 tracking-wider text-primary-soft-foreground shadow-md">
                    <img src="/images/landing/pricing-star.svg" alt="" />
                    Recommended
                  </span>
                ) : null}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className={typography.headingH3}>{plan.name}</h3>
                    <p
                      className={`mt-1 ${typography.bodySm} ${highlighted ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}
                    >
                      {plan.description}
                    </p>
                  </div>
                  <Link
                    href={href}
                    aria-label={`Explore ${plan.name}`}
                    className={`grid size-10 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${highlighted ? 'bg-card' : 'bg-foreground'}`}
                  >
                    <img
                      src={`/images/landing/pricing-arrow-${highlighted ? 'dark' : 'light'}.svg`}
                      alt=""
                      className="-rotate-45"
                    />
                  </Link>
                </div>
                <p className="mt-9 flex flex-wrap items-baseline gap-2">
                  <span className={typography.price}>{formatCurrency(plan.amountPaise / 100)}</span>
                  <span
                    className={`${typography.bodyMd} ${highlighted ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}
                  >
                    / month
                  </span>
                </p>
                <p
                  className={`mt-4 flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 ${typography.labelMd} ${highlighted ? 'bg-primary-foreground/15' : 'bg-card text-secondary-foreground'}`}
                >
                  <img
                    src={`/images/landing/pricing-sparkles${highlighted ? '-light' : ''}.svg`}
                    alt=""
                  />
                  {offer
                    ? `₹0 for your first ${offer.months} months`
                    : plan.amountPaise === 0
                      ? 'No card needed'
                      : 'Billed monthly'}
                </p>
                <ul className="my-7 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className={cn(typography.bodySm, 'flex items-start gap-2.5')}>
                      <span
                        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${highlighted ? 'bg-primary-foreground/20' : 'bg-card'}`}
                      >
                        <img
                          src={`/images/landing/pricing-check${highlighted ? '-light' : ''}.svg`}
                          alt=""
                        />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  variant={highlighted ? 'secondary' : 'emphasis'}
                  className={`mt-3 h-12 justify-between pl-5 pr-1.5 shadow-none ${typography.labelMd} ${highlighted ? 'bg-card text-secondary-foreground hover:bg-card/90' : ''}`}
                >
                  <Link href={href}>
                    {offer
                      ? `Start ${offer.months} months free`
                      : plan.tier === 'hobby'
                        ? 'Start with Hobby'
                        : `Choose ${plan.name}`}
                    <span
                      className={`grid size-9 place-items-center rounded-full ${highlighted ? 'bg-primary' : 'bg-card'}`}
                    >
                      <img
                        src={`/images/landing/pricing-arrow-${highlighted ? 'light' : 'dark'}-small.svg`}
                        alt=""
                        className="-rotate-45"
                      />
                    </span>
                  </Link>
                </Button>
              </Card>
            </Reveal>
          );
        })}
      </div>
      <div className="mt-7 flex flex-wrap items-start justify-between gap-4 px-2 text-sm text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <img src="/images/landing/pricing-reviewed.svg" alt="" />
          Every project reviewed before it goes live
        </p>
        <Link
          href="/designer/plan-billing/subscribe"
          className="flex items-center gap-1.5 text-secondary-foreground hover:underline"
        >
          Compare all features
          <img src="/images/landing/arrow-right.svg" alt="" />
        </Link>
      </div>
      {catalog.earlyBird ? (
        <p className="mt-4 px-2 text-sm leading-6 text-muted-foreground">
          One trial per organization, for new paid customers. Claim by 31 December 2026. After three
          months, return to Hobby or choose a paid subscription at the prices above. No automatic
          charges.
        </p>
      ) : null}
    </div>
  );
}
