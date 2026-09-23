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

See [staging validation](./billing-staging-smoke.md) for the separate merchant Test Mode checks required before rollout.
