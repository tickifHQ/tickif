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
      radius="lg"
      variant={isSelected || isCurrent ? 'accent' : 'default'}
      className={`flex min-w-0 flex-col shadow-none md:row-span-2 md:grid md:grid-rows-subgrid md:rounded-none ${isSelected || isCurrent ? '' : 'md:border-transparent'}`}
    >
      <CardHeader className="gap-3 p-5">
        <div className="flex min-h-7 flex-wrap items-center gap-2">
          <CardTitle className="text-base leading-6">
            <h3>{plan.label}</h3>
          </CardTitle>
          {isCurrent ? (
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/10 text-[color-mix(in_oklab,var(--primary)_75%,var(--foreground))]"
            >
              Current plan
            </Badge>
          ) : null}
          {isSelected && !isCurrent ? <Badge variant="outline">Selected plan</Badge> : null}
        </div>
        <div className="flex flex-wrap items-baseline gap-1">
          <span className="text-2xl font-semibold tracking-tight">
            {formatCurrency(plan.price)}
          </span>
          <span className="text-sm text-muted-foreground">/month</span>
        </div>
        <CardDescription className="text-xs leading-5">
          Per organization, billed monthly
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 px-5 pb-5 md:hidden">
        <ul className="flex flex-col gap-2">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-xs leading-5">
              <Check className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3 px-5 pb-5">
        {hideAction ? (
          <p className="min-h-10 text-sm text-muted-foreground">{actionReason}</p>
        ) : (
          <Button
            variant={currentActionDisabled ? 'outline' : 'fancy'}
            className="h-auto min-h-9 w-full whitespace-normal text-xs leading-snug md:h-10 md:py-0"
            disabled={currentActionDisabled || isLocked}
            onClick={() => onSelect(plan.tier)}
            aria-label={currentActionDisabled ? `${plan.label} is your current plan` : label}
            aria-describedby={actionReason ? reasonId : undefined}
          >
            {currentActionDisabled ? 'Current plan' : label}
          </Button>
        )}
        {!hideAction && actionReason ? (
          <p id={reasonId} className="text-xs leading-5 text-muted-foreground">
            {actionReason}
          </p>
        ) : null}
      </CardFooter>
    </Card>
  );
}
