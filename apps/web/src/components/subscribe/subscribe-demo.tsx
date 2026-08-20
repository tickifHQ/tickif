'use client';

import { useState } from 'react';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import type { PlanTier } from '@/lib/plan-config';
import { PLANS } from '@/lib/plan-config';
import { SubscribeFlowDialog } from './subscribe-flow-dialog';

/**
 * Development-only demo for the E-120 Subscribe flow.
 * Provides buttons to open the dialog with different current-plan states.
 * NOT a production page — used only to exercise the flow during development.
 */
export function SubscribeDemo() {
  const [open, setOpen] = useState(false);
  const [currentTier, setCurrentTier] = useState<PlanTier>('professional_plus');

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold text-foreground">E-120 Subscribe Flow Demo</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Development only. Select a current plan, then open the subscribe dialog.
      </p>

      <Card radius="2xl" className="mt-6 p-5">
        <p className="text-sm font-semibold text-foreground">Current Plan (mock)</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PLANS.map((plan) => (
            <Button
              key={plan.tier}
              variant={currentTier === plan.tier ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentTier(plan.tier)}
            >
              {plan.label}
            </Button>
          ))}
        </div>
      </Card>

      <Button className="mt-6 w-full" onClick={() => setOpen(true)}>
        Open Subscribe Flow
      </Button>

      <SubscribeFlowDialog
        open={open}
        onOpenChange={setOpen}
        currentTier={currentTier}
      />
    </div>
  );
}
