'use client';

import { useId } from 'react';
import { Button } from '@repo/ui/components/button';
import { Badge } from '@repo/ui/components/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@repo/ui/components/card';
import { Check } from 'lucide-react';
import type { PlanTier } from '@repo/contracts';
import { formatCurrency, getCumulativeFeatures, type PlanDefinition } from '@/lib/plan-config';

interface PlanCardProps {
  plan: PlanDefinition;
  isCurrent: boolean;
  isLocked?: boolean;
  isSelected?: boolean;
  allowCurrentAction?: boolean;
  actionLabel?: string;
  actionReason?: string;
  hideAction?: boolean;
  onSelect: (tier: PlanTier) => void;
}

/** Plan summaries reuse flat cards; availability is supplied by the billing controller. */
export function PlanCard({
  plan,
  isCurrent,
  isLocked = false,
  isSelected = false,
  allowCurrentAction = false,
  actionLabel,
  actionReason,
  hideAction = false,
  onSelect,
}: PlanCardProps) {
  const reasonId = useId();
  const features = getCumulativeFeatures(plan.tier);
  const label =
    actionLabel ?? (plan.tier === 'hobby' ? 'Switch to Hobby' : `Upgrade to ${plan.label}`);
  const currentActionDisabled = isCurrent && !allowCurrentAction;

  return (
    <Card
      variant={isSelected && !isCurrent ? 'accent' : 'ghost'}
      className="flex min-w-0 flex-col rounded-none shadow-none md:row-span-4 md:grid md:grid-rows-subgrid"
    >
      <CardHeader className="gap-4">
        <div className="flex min-h-7 flex-wrap items-center gap-2">
          <CardTitle>
            <h3>{plan.label}</h3>
          </CardTitle>
          {isCurrent ? <Badge variant="secondary">Current plan</Badge> : null}
          {isSelected && !isCurrent ? <Badge variant="outline">Selected plan</Badge> : null}
        </div>
        <div className="flex flex-wrap items-baseline gap-1">
          <span className="text-3xl font-semibold tracking-tight">
            {formatCurrency(plan.price)}
          </span>
          <span className="text-sm text-muted-foreground">/month</span>
        </div>
        <CardDescription>Per organization, billed monthly</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="flex flex-col gap-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3 md:row-span-2 md:grid md:grid-rows-subgrid">
        {hideAction ? (
          <p className="min-h-10 text-sm text-muted-foreground">{actionReason}</p>
        ) : (
          <Button
            variant={isSelected && !isCurrent ? 'default' : 'outline'}
            className="h-auto min-h-10 w-full whitespace-normal"
            disabled={currentActionDisabled || isLocked}
            onClick={() => onSelect(plan.tier)}
            aria-label={currentActionDisabled ? `${plan.label} is your current plan` : label}
            aria-describedby={actionReason ? reasonId : undefined}
          >
            {currentActionDisabled ? 'Current plan' : label}
          </Button>
        )}
        <p id={reasonId} className="min-h-10 text-sm text-muted-foreground">
          {hideAction ? null : actionReason}
        </p>
      </CardFooter>
    </Card>
  );
}
