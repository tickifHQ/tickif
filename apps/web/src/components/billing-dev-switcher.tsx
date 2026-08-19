'use client';

import { useState } from 'react';
import { ChevronDown, FlaskConical } from 'lucide-react';
import type { BillingState } from '@/lib/billing-types';
import type { BillingLifecycleState, PlanTier } from '@/lib/billing-types';
import {
  DEV_SCENARIOS,
  DEV_LIFECYCLES,
  hasBillingAccess,
  buildBillingState,
  type OrgRole,
} from '@/lib/billing-fixtures';
import { DesignerPlanBilling } from '@/components/designer-plan-billing';

/**
 * Development-only billing context switcher.
 *
 * Renders the Plan & Billing page with an interactive control to switch between
 * all billing scenarios (tier × role × lifecycle). Stripped from production
 * builds because the page.tsx only renders this when NODE_ENV !== 'production'.
 */
export function BillingDevSwitcher({ initialBilling }: { initialBilling: BillingState }) {
  const [tier, setTier] = useState<PlanTier>(initialBilling.tier);
  const [role, setRole] = useState<OrgRole>('owner');
  const [lifecycle, setLifecycle] = useState<BillingLifecycleState>(initialBilling.lifecycle);
  const [open, setOpen] = useState(false);

  const billing = buildBillingState(tier, lifecycle);
  const hasAccess = hasBillingAccess(role);

  function applyScenario(scenario: (typeof DEV_SCENARIOS)[number]) {
    setTier(scenario.tier);
    setRole(scenario.role);
    setLifecycle(scenario.lifecycle);
  }

  return (
    <div>
      {/* Dev switcher control — fixed bottom-right */}
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
              Development only — not visible in production
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
                      tier === scenario.tier && role === scenario.role
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {scenario.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lifecycle override */}
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Lifecycle State
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {DEV_LIFECYCLES.map((lc) => (
                  <button
                    key={lc.value}
                    type="button"
                    onClick={() => setLifecycle(lc.value)}
                    className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                      lifecycle === lc.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {lc.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Current state display */}
            <div className="mt-3 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-[10px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tier</span>
                <span className="font-medium text-foreground">{tier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Role</span>
                <span className="font-medium text-foreground">{role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lifecycle</span>
                <span className="font-medium text-foreground">{lifecycle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Has billing access</span>
                <span className={`font-medium ${hasAccess ? 'text-primary' : 'text-destructive'}`}>
                  {hasAccess ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Page content — access-gated */}
      {hasAccess ? (
        <DesignerPlanBilling billing={billing} role={role} />
      ) : (
        <div className="flex flex-col items-center justify-center px-6 py-32 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-muted">
            <FlaskConical className="size-7 text-muted-foreground" />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-foreground">
            Billing access restricted
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Only the organization <strong>Owner</strong> and <strong>Billing Admin</strong> can view
            Plan & Billing. Your current role ({role}) does not have access.
          </p>
        </div>
      )}
    </div>
  );
}
