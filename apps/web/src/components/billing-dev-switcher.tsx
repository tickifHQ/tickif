'use client';

import { useState } from 'react';
import { ChevronDown, FlaskConical } from 'lucide-react';
import type { BillingState } from '@/lib/billing-types';
import type { BillingLifecycleState, PlanTier } from '@/lib/billing-types';
import { DEV_SCENARIOS, buildBillingState } from '@/lib/billing-fixtures';
import { DesignerPlanBilling } from '@/components/designer-plan-billing';

/**
 * Development-only billing context switcher.
 *
 * Renders as an additive floating panel that lets developers preview different
 * billing scenarios. When a scenario is selected, it renders a second copy of
 * DesignerPlanBilling below the real page output with the overridden state.
 *
 * The production page always renders above this — the switcher never replaces it.
 */
export function BillingDevSwitcher({ initialBilling }: { initialBilling: BillingState }) {
  const [tier, setTier] = useState<PlanTier>(initialBilling.tier);
  const [lifecycle, setLifecycle] = useState<BillingLifecycleState>(initialBilling.lifecycle);
  const [preLapseTier, setPreLapseTier] = useState<PlanTier | null>(
    initialBilling.preLapseTier,
  );
  const [previewActive, setPreviewActive] = useState(false);
  const [open, setOpen] = useState(false);

  const billing = buildBillingState(tier, lifecycle, preLapseTier);

  function applyScenario(scenario: (typeof DEV_SCENARIOS)[number]) {
    setTier(scenario.tier);
    setLifecycle(scenario.lifecycle);
    setPreLapseTier(scenario.preLapseTier ?? null);
    setPreviewActive(true);
  }

  return (
    <>
      {/* Dev preview — renders below the real page when active */}
      {previewActive && (
        <div className="border-t-4 border-dashed border-primary/30">
          <div className="bg-primary/5 px-6 py-2 text-xs font-medium text-primary">
            Dev Preview: {tier} × {lifecycle}
          </div>
          <DesignerPlanBilling billing={billing} />
        </div>
      )}

      {/* Floating switcher control */}
      <div className="fixed bottom-4 right-4 z-50">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground shadow-lg transition-colors hover:text-foreground"
        >
          <FlaskConical className="size-3.5 text-primary" />
          Dev: Billing
          <ChevronDown className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute bottom-full right-0 mb-2 w-72 rounded-xl border border-border bg-background p-4 shadow-xl">
            <p className="text-xs font-bold text-foreground">Billing Dev Switcher</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Development only — preview billing scenarios below the real page
            </p>

            {/* Scenario presets */}
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Scenarios
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {DEV_SCENARIOS.map((scenario) => (
                  <button
                    key={scenario.label}
                    type="button"
                    onClick={() => applyScenario(scenario)}
                    className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                      previewActive && tier === scenario.tier && lifecycle === scenario.lifecycle
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {scenario.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Close preview */}
            {previewActive && (
              <button
                type="button"
                onClick={() => setPreviewActive(false)}
                className="mt-3 w-full rounded-md border border-border px-2 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Close Preview
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
