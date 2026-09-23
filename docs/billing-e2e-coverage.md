# Billing E2E acceptance matrix

The billing suite uses real local authentication, HTTP API routes, PostgreSQL, browser pages and signed webhooks. Only the Razorpay boundary is deterministic. It does not certify real mandate eligibility, settlement, refunds or provider proration.

## Every plan pair

All nine source/target combinations run on both Plan & Billing and Subscribe (18 cases).

| Current plan | Hobby target | Professional+ target | Corporate target |
| --- | --- | --- | --- |
| Hobby | No purchase or mutation | Explicit checkout, then verified activation | Explicit checkout, then verified activation |
| Professional+ | Cancel at cycle end, retain access | No purchase or mutation | Explicit deferred recovery, then replacement after termination |
| Corporate | Cancel at cycle end, retain access | Explicit deferred recovery, then replacement after termination | No purchase or mutation |

Direct paid-plan updates remain disabled until provider capability and charge authorization are verified. These tests assert the current explicit recovery contract; they do not count deferred recovery as proof of an immediate upgrade.

## Same billing cycle

Four independent sequences start with an actual Hobby checkout and signed activation: each paid tier followed by Hobby cancellation, and each paid tier followed by paid-plan recovery. Each sequence tries both the original and other paid tier again before expiry and checks:

- Existing access, subscription identity and paid-period end remain unchanged.
- No replacement purchase, duplicate cancellation, or in-place provider change occurs.
- The accepted recovery target survives refresh and repeated attempts.
- Only provider-confirmed termination permits separately confirmed replacement checkout.
- Replacement activation completes recovery; delayed events for the old subscription cannot restore old access.

## Other boundaries

- Checkout dismissal, reload and reuse without premature activation.
- Expired, tampered, wrong-target and cross-organization preview rejection.
- Concurrent submissions and completed-operation replay create one provider checkout.
- Recovery revision conflicts, eligible-target replacement and dismissal without cancellation reversal.
- Revoked billing permissions reject previews, mutations and billing reads.
- Provider outage: no guessed eligibility or mutation.
- Lost responses after accepted create/cancel/recovery calls: durable uncertainty, reconciliation, and no blind duplicate request.
- Invalid signatures, duplicate events and delayed events cannot grant or roll back access.
- Unfinished checkouts reject another target and reuse the original provider ID; authenticated checkouts wait for activation.
- Pending and halted mandates require payment recovery; an existing scheduled plan update blocks a conflicting selection.
- Both entry points and all current tiers remain usable at desktop and mobile widths.

## Enforcement and execution

The critical E2E manifest requires all 43 billing cases to execute exactly once and pass. Its unit test rejects missing or skipped cases. Run the billing suite with the isolated E2E environment documented by `packages/config/src/e2e.ts`:

```sh
pnpm --filter @repo/api build
pnpm --filter @repo/worker build
pnpm --filter @repo/e2e build:launchers
pnpm --filter @repo/e2e test:e2e billing-management.spec.ts billing-plan-matrix.spec.ts billing-same-cycle.spec.ts billing-boundaries.spec.ts billing-provider-failures.spec.ts
```

Validated 23 September 2026: **43 passed, zero skipped, zero unexpected failures, zero flaky cases**. The manifest's nine unit tests pass.

Final workspace checks also pass: `pnpm typecheck`, `pnpm lint`, and `pnpm test` (all 14 tasks successful; API 1,825 passed, frontend 1,274 passed). Four merchant connectivity tests are intentionally skipped without dedicated Test Mode credentials. Discovery matches all 99 critical CI manifest entries, including the 43 billing cases.

This expansion found and fixed two application defects: Subscribe unmounted checkout during background refresh, and eligible recovery-target replacement rejected the intentionally cleared local provider ID after cancellation. Both have focused unit regressions as well as passing E2E coverage.

UI review follow-up, 24 September 2026: pricing-card actions now share grid rows, and the desktop comparison cases check that all three buttons have matching top and bottom edges within one pixel. The assertion reproduced the original 40-pixel offset before the fix. Mobile cards remain stacked. Billing messages now refer to selected or saved plans instead of targets, and describe pending changes without internal status names. The 29 affected comparison, checkout, plan-matrix and same-cycle E2E cases pass with the updated wording; the 73 focused component assertions also pass.

Automatic-update follow-up: billing pages, pending-change dialogs and payment history check for changes without a Refresh button. Reads are serialized, run every 30 seconds normally and every 5 seconds for pending changes, pause while hidden/offline, resume on focus/reconnection, and back off after failures. Dialog checks share the parent reconciliation request. Background reads never confirm a purchase, resubmit a mutation or replace the selected plan. Existing browser journeys now wait for activation and expiry on the mounted page/dialog instead of refreshing it; reloads remain only where persistence itself is being tested. Unit regressions cover coalescing, backoff, teardown, organization changes, late activation, lost responses and payment-history pagination races.

Follow-up validation: all **1,298 frontend tests** pass. All **43 billing E2E cases** are verified: 42 passed in the full run, and the remaining payment-history case passed after its old error-text assertion was updated. That rerun also captured three comparison/checkout/recovery journeys (four passing cases total). Workspace typecheck and lint pass. No backend implementation or migration changed in this follow-up.

Status-panel follow-up: both billing pages now show one status panel, prioritizing a pending change or checkout over saved-plan and schedule records. Waiting plans show the current access end date and when the saved plan can be purchased, with no premature review action. Eligible plans offer one review action; unfinished checkout offers one continuation action; payment confirmation has no purchase action. Completed recovery notices disappear. The pricing table and other plan controls respect these states instead of offering competing actions. Shared restrictions appear once below the plan summaries. Removing a saved plan requires opening its secondary menu and confirming that any scheduled cancellation remains in place; canceling that confirmation leaves the recovery revision and provider cancellation untouched. A changed recovery revision disables an already-open removal confirmation.

Status-panel validation: workspace typecheck, lint, build and all 14 test tasks pass, including 1,316 frontend tests, 1,825 API tests and 186 worker tests. Four merchant connectivity tests remain credential-gated. All 43 billing browser cases are verified: 40 passed in the full run and the three cases that referenced removed cancellation-state controls passed after their assertions were updated. The six-case follow-up also recorded all three evidence journeys. Cancellation-to-saved-plan behavior remains covered through authenticated API requests where the UI now intentionally hides plan switches during the waiting period; the published recovery video uses the supported UI throughout.

See [staging validation](./billing-staging-smoke.md) for the separate merchant Test Mode checks required before rollout.
