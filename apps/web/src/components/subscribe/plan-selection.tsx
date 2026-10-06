'use client';

import type { PlanTier, SubscriptionState } from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Separator } from '@repo/ui/components/separator';
import { TipCallout } from '@repo/ui/components/tip-callout';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from '@repo/ui/components/table';
import { Check } from 'lucide-react';
import { PLANS, PLAN_FEATURE_GROUPS, isDowngrade } from '@/lib/plan-config';
import { PlanCard } from './plan-card';

interface PlanSelectionProps {
  headingLevel?: 1 | 2;
  description?: string;
  currentTier: PlanTier;
  lifecycleState: SubscriptionState;
  selectedTier?: PlanTier | null;
  actions?: Partial<
    Record<PlanTier, { label?: string; disabled?: boolean; hidden?: boolean; reason?: string }>
  >;
  onSelectPlan: (tier: PlanTier) => void;
}

function FeatureValue({ value }: { value: string | boolean }) {
  if (value === true)
    return (
      <span className="inline-flex items-center gap-1">
        <Check className="size-4" aria-hidden="true" />
        <span className="sr-only">Included</span>
      </span>
    );
  if (value === false)
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Not included</span>
      </span>
    );
  return <span>{value}</span>;
}

export function PlanSelection({
  headingLevel = 2,
  description = 'Compare plans for your design business.',
  currentTier,
  lifecycleState,
  selectedTier,
  actions,
  onSelectPlan,
}: PlanSelectionProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const hiddenReasons = [
    ...new Set(
      PLANS.flatMap((plan) => {
        const reason = actions?.[plan.tier]?.reason;
        return reason ? [reason] : [];
      }),
    ),
  ];
  const sharedRestriction =
    PLANS.every((plan) => actions?.[plan.tier]?.hidden) && hiddenReasons.length === 1
      ? hiddenReasons[0]
      : undefined;
  const paymentRestricted = ['locked', 'payment_failed', 'grace'].includes(lifecycleState);
  const lifecycleReason =
    lifecycleState === 'locked'
      ? 'Your subscription is currently suspended. Resolve the payment issue before changing plans.'
      : paymentRestricted
        ? 'Resolve your payment issue before changing plans. Use Update Payment Method to recover access.'
        : undefined;

  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label="Choose your plan">
      <div>
        <Heading
          className={
            headingLevel === 1
              ? 'text-2xl font-semibold tracking-tight text-foreground'
              : 'text-lg font-semibold text-foreground'
          }
        >
          Choose your plan
        </Heading>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      {lifecycleReason || lifecycleState === 'downgraded' ? (
        <Alert>
          <AlertDescription>
            {lifecycleReason ??
              'You are now on the free plan. Choose a paid plan to get started again.'}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 md:grid-cols-4 md:gap-0 md:border-y md:border-border">
        <div className="hidden md:row-span-2 md:block" aria-hidden="true" />
        {PLANS.map((plan) => {
          const action = actions?.[plan.tier];
          const label =
            plan.tier === 'hobby'
              ? 'Switch to Hobby'
              : `${isDowngrade(currentTier, plan.tier) ? 'Downgrade' : 'Upgrade'} to ${plan.label}`;
          return (
            <PlanCard
              key={plan.tier}
              plan={plan}
              isCurrent={plan.tier === currentTier}
              allowCurrentAction={action?.disabled === false}
              isSelected={selectedTier === plan.tier}
              isLocked={action?.disabled ?? paymentRestricted}
              actionLabel={action?.label ?? label}
              hideAction={action?.hidden}
              actionReason={
                sharedRestriction
                  ? undefined
                  : (action?.reason ?? (plan.tier === currentTier ? undefined : lifecycleReason))
              }
              onSelect={onSelectPlan}
            />
          );
        })}
      </div>
      {sharedRestriction ? (
        <p className="text-sm text-muted-foreground">{sharedRestriction}</p>
      ) : null}
      <div className="hidden md:block">
        <Table aria-label="Compare plan features" className="table-fixed">
          <TableCaption className="mt-5 text-xs">
            Monthly organization plans. Display prices are not a payment quote.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="w-1/4 px-0">
                Features
              </TableHead>
              {PLANS.map((plan) => (
                <TableHead key={plan.tier} scope="col" className="w-1/4 px-5">
                  {plan.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {PLAN_FEATURE_GROUPS.map((group) => (
            <TableBody key={group.label}>
              <TableRow>
                <TableHead
                  scope="rowgroup"
                  colSpan={4}
                  className="px-0 pt-7 pb-3 font-semibold text-foreground"
                >
                  {group.label}
                </TableHead>
              </TableRow>
              {group.features.map((feature) => (
                <TableRow key={feature.label}>
                  <TableHead
                    scope="row"
                    className="px-0 py-3 pr-5 font-normal leading-5 whitespace-normal"
                  >
                    {feature.label}
                  </TableHead>
                  {PLANS.map((plan) => (
                    <TableCell key={plan.tier} className="px-5 py-3 leading-5">
                      <FeatureValue value={feature.values[plan.tier]} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          ))}
        </Table>
      </div>
      <section className="flex flex-col gap-6 md:hidden" aria-label="Plan features by tier">
        {PLAN_FEATURE_GROUPS.map((group) => (
          <section key={group.label} className="flex flex-col gap-4" aria-label={group.label}>
            <h3 className="font-semibold">{group.label}</h3>
            {group.features.map((feature) => (
              <div key={feature.label} className="flex flex-col gap-2">
                <h4 className="text-sm font-medium">{feature.label}</h4>
                <dl className="flex flex-col gap-2 text-sm">
                  {PLANS.map((plan) => (
                    <div key={plan.tier} className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">{plan.label}</dt>
                      <dd className="text-right">
                        <FeatureValue value={feature.values[plan.tier]} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            <Separator />
          </section>
        ))}
      </section>
      <TipCallout label="Note" align="start" role="note" aria-label="Plan purchase notes">
        Purchasing a plan does not grant verification. Verified badges remain subject to
        verification approval. Final charges and change timing are shown separately during review.
      </TipCallout>
    </section>
  );
}
