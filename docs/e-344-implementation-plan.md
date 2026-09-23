# E-344 implementation plan: plan-change timing and cancellation recovery

Prepared 24 September 2026. Planning only; this document does not enable billing mutations.

- Issue: [E-344](https://linear.app/tickif/issue/E-344/billing-fix-plan-change-timing-and-scheduled-cancellation-recovery), including the recovery scope folded into that issue.
- Parent: [E-323](https://linear.app/tickif/issue/E-323).
- Base: [PR #640](https://github.com/tickifHQ/tickif/pull/640), branch `codex/e-343-billing-recovery`, reviewed at `098d119a9a99fb56893a0c71ec929d22521be894`.
- This plan describes the remaining work on that base. It supersedes the E-344 timing/recovery proposals in [the earlier combined plan](./e-343-implementation-plan.md), while retaining its E-343 comparison scope.

## Outcome and boundaries

Support immediate Professional+ → Corporate upgrades on verified eligible mandates, Corporate → Professional+ downgrades at the current cycle end, and paid → Hobby through scheduled cancellation. Provider-confirmed state determines access. Unsupported methods retain explicit deferred recovery with the chosen target, current paid access and a separately confirmed replacement purchase after verified termination.

Do not count deferred recovery as immediate-upgrade acceptance. If no merchant/payment-method path can satisfy the capability and charge-authorization gates, record the blocker and leave E-344 open. Do not add annual billing, change prices, replace Razorpay, redesign the comparison, or implement an automatic cancellation-and-repurchase workaround.

## What #640 already provides, and what remains

| Area | Reviewed baseline | E-344 delta |
| --- | --- | --- |
| Selection | `selection-service.ts` sends every active paid-to-paid selection to recovery; a generic card marker is deliberately insufficient | Resolve direction and independently verified upgrade/downgrade eligibility server-side |
| Provider mutation | `subscribe-service.ts::changePlan` hardcodes `cycle_end`; `razorpay-client.ts::updateSubscription` already accepts `now` | Select timing from the validated server preview; enforce eligibility at execution |
| Confirmation | Signed, five-minute previews bind actor, organization, target and provider revision | Bind timing, capability evidence and enforceable adjustment authorization as well |
| Operations | Durable reservation, organization lock, replay and uncertain-outcome blocking | Reconcile paid-plan operations; stop reporting every non-checkout mutation as `scheduled` |
| Recovery | Saved target, explicit cancellation consent, revision checks, worker/visit reconciliation and separate replacement checkout | Preserve this fallback; only expose cancellation revocation if explicitly supported and verified |
| Entitlements | `subscription.updated` fetches the live plan; activated/charged handlers include stale-event protection | Prove paid change completion, correlate financial evidence where needed, settle the operation and refresh all dependent state |
| UI | Shared `checkout-flow.tsx`, selection context, reason copy and saved recovery notice | Render eligible immediate/scheduled changes and their pending/failure outcomes in that shared flow |
| Tests | 43 baseline billing E2E cases; paid pairs currently expect recovery | Retain unsupported-method expectations and add eligible-method timing cases |

The issue mentions `upgrade-confirmation-step.tsx` and `downgrade-confirmation-step.tsx`. They remain on disk, but the reviewed shared checkout flow renders its own preview. Trace actual imports before changing them; do not implement the new behavior only in unused components.

## 1. Verify provider capabilities before enabling paths

Documentation was checked on 24 September 2026; documentation review is not merchant sandbox verification.

| Evidence | Consequence |
| --- | --- |
| [Update API](https://razorpay.com/docs/api/payments/subscriptions/update-subscription) exposes immediate and cycle-end scheduling | Use the existing wrapper, after eligibility verification; do not invent another endpoint |
| [Update guide](https://razorpay.com/docs/payments/subscriptions/update/) limits domestic-card updates to offers and describes immediate adjustments, failed-charge behavior and minimum adjustment restrictions | Domestic-card plan changes remain on recovery. Test proration boundaries and payment failure before enabling another card path |
| [Subscriptions FAQ](https://razorpay.com/docs/payments/subscriptions/faqs) says UPI subscriptions cannot be updated | Preserve the explicit UPI limitation and recovery path |
| [Pause/resume/cancel guide](https://razorpay.com/docs/payments/subscriptions/pause-resume-cancel) documents distinct lifecycle operations | Do not equate resuming a paused mandate with revoking a scheduled cancellation |

Create `docs/billing-provider-capabilities.md` during implementation. For domestic card, international card, UPI, eMandate and unknown method, record: account/mode, authoritative eligibility fields and their source, permitted source state, update timing, adjustment behavior, cancellation/revocation support, observed errors and dated sanitized test evidence. International card and eMandate are unverified candidates, not presumed supported paths. Never infer eligibility from price, notes, the browser's payment-method selection or `method=card` alone.

Resolve two release gates first:

1. **Mandate gate:** identify a trustworthy provider query that establishes support for this subscription and merchant. Verify both immediate upgrade and cycle-end downgrade independently. Missing/ambiguous evidence keeps the corresponding path disabled.
2. **Consent gate:** establish how the displayed immediate adjustment can be authorized and enforced. The inspected update API does not establish a quote/maximum-charge mechanism. A local estimate or signed preview cannot constrain a provider-computed debit. Record a verified mechanism or an explicit product/provider decision before enabling immediate updates; otherwise retain `amount_authorization_unavailable`. Do not add a second manual charge alongside the provider adjustment.

For scheduled cancellation, investigate revocation separately from cancelling a pending plan update. No revocation endpoint is assumed by this plan. If unsupported, continue #640's wait-until-termination path with the exact known eligibility date; if the provider date is unknown, say so rather than manufacture one.

## 2. Define direction, eligibility and preview contracts

Extend `packages/contracts/src/billing-selection.ts` and provider schemas in `razorpay.ts`, then implement a pure server policy used by selection and execution. Use explicit configured tier ordering (`hobby < professional_plus < corporate`), never monetary comparisons. Continue resolving plan IDs from validated configuration.

| Current → target | Intended behavior | Access transition |
| --- | --- | --- |
| Hobby → either paid tier | Existing explicit checkout | After verified activation/payment lifecycle |
| Professional+ → Corporate | Eligible mandate + enforceable consent: update `now`; otherwise explicit recovery | Only after verified successful provider change |
| Corporate → Professional+ | Eligible mandate: update `cycle_end`; otherwise explicit recovery | Retain Corporate until provider confirms effective downgrade |
| Either paid tier → Hobby | Cancel at cycle end | Retain paid access through the valid paid period; reconcile terminal state |
| Same tier | No mutation | Unchanged |
| Scheduled cancellation → paid target | Verified revocation only if available; otherwise save/replace target and await termination | Never grant target access merely because intent is saved |
| Pending/halted, conflicting checkout, pending change or unknown provider state | Existing recovery/block with a specific next action | No speculative entitlement change |

Preview must show current/target tiers, action, timing, effective date, next renewal, recurring price, adjustment amount/direction/certainty, and the unsupported-path reason. Keep amounts in integer minor units. Distinguish an immediate request from confirmed activation. Unknown is not zero; estimates must be labelled and cannot silently authorize an unbounded debit.

Include the eligibility and authorization revision in the signed preview. Re-fetch relevant state immediately before mutation; stale plan, price, mandate, period, pending update, cancellation or organization context requires a new review. Continue enforcing billing capability and shared Zod request/response validation on every endpoint.

## 3. Execute one durable operation and reconcile its outcome

Primary files: `mutation-service.ts`, `subscribe-service.ts`, `selection-service.ts`, `operation-repository.ts`, `subscribe-repository.ts`, `razorpay-client.ts`.

1. Add failing tests for the unconditional cycle-end update and blanket recovery selection. Extend the existing reservation flow; commit the operation before a provider side effect.
2. Pass the server-approved timing into `changePlan`; do not accept a client override. Recheck current source subscription and eligibility. Preserve scoped domestic-card/UPI rejection handling from E-289/PR #511.
3. Keep immediate success in `processing` until authoritative reconciliation establishes completion; use `scheduled` only after a pending downgrade is verified. Return `activated` only when the verified entitlement transition has occurred.
4. Replay the same operation ID without another provider call. Reject ID reuse for another target/action. Block concurrent operations across different IDs, including cancellation/recovery races. A pending scheduled downgrade must block conflicting changes even after its operation reservation is released.
5. Treat timeouts, connection loss, malformed success responses and crashes after submission as uncertain. Reconcile by current subscription, pending update and verified invoice/payment evidence; do not blindly retry. A definite rejection permits a freshly reviewed operation. Absence of observed change alone is not proof the request failed.
6. Persist enough intent for crash recovery: source/target plan, timing, expected period, consent evidence and provider references where available. Reuse `billing_operation`; add typed columns only for data needed after restart. Generate a new additive migration with `pnpm db:generate`, review its SQL and commit it. Do not edit #640's migration 0069.

Extend visit and worker reconciliation to cover `change_plan` as well as existing checkout/cancellation cases. Use bounded retries/backoff and an actionable support state for unresolved operations; do not release the lock merely because a timeout elapsed.

Maintain route → service → repository layering. The existing webhook service contains legacy Drizzle access: move touched persistence into `webhook-repository.ts` as part of this work rather than copying that pattern. Keep provider orchestration in services/adapters and transactional state changes in repositories.

## 4. Apply verified transitions and preserve recovery

Primary files: `webhook-service.ts`, `webhook-repository.ts`, API recovery services/repositories, `apps/worker/src/billing-lifecycle/` and `apps/worker/src/jobs/billing-lifecycle.ts`.

- Reconcile signed `subscription.updated`, activated/charged events and worker fetches against the current provider subscription and configured plan mapping. Establish from sandbox evidence whether a confirmed live plan is sufficient or whether the adjustment invoice/payment must also be verified. Pending updates and failed adjustment payments must not grant the target tier.
- Deduplicate payment records by provider identity; never fabricate a full-price payment from a plan change. Tie a required adjustment to the correct subscription/operation, amount, currency and final payment state.
- Under the organization/subscription lock, update entitlements and operation outcome consistently. Ignore old subscription identities and stale events; delayed events must not reverse a later confirmed transition. Preserve period boundaries and cancellation flags according to fresh provider state.
- Reconcile seats, branches, search projections and entitlement caches through the existing paths. Retrying an event must repair interrupted follow-up work without creating another financial transaction.
- Keep paid access during scheduled cancellation. Recovery eligibility requires verified source termination, not the browser clock reaching a date. Replacement checkout requires new explicit consent and must not overlap a billable source subscription.
- Saving/replacing/removing a recovery target must not imply cancellation revocation. For any verified future revocation path, persist intent, reconcile the revoke result, then require a fresh plan-change preview; never issue an unconditional revoke-and-upgrade chain.

## 5. Show accurate review and pending states on both pages

Extend `checkout-flow.tsx`, `billing-reason.ts`, `use-selection-context.ts`, `saved-recovery-notice.tsx` and the billing overview integration. Reuse #640's components, selection persistence and capability checks.

- Before confirmation, show the selected target, actual timing/date, recurring cost and verified adjustment information. State domestic-card/UPI limitations before the cancellation consent step.
- After an immediate request, show processing until confirmed; after a downgrade, show target and cycle-end date while the current tier remains active. Failure retains the selected target and gives the eligible next action.
- Refresh server billing/entitlement state after mutation and use bounded status refresh for asynchronous webhook completion. Clear completed intent only when the chosen tier is actually current. Prevent stale responses from a previous organization updating the screen.
- Reload/dismissal must never resubmit, reopen payment automatically or discard the saved target. Preserve the existing mobile and keyboard-accessible review experience.

## 6. Validation and acceptance

Start with failing reproductions, then update the existing tests rather than creating a disconnected billing test harness.

| Layer | Required evidence |
| --- | --- |
| Unit/contracts | Explicit direction for all nine tier pairs; each method/state eligibility combination; exact timing passed to provider; unknown/expired consent; price/period changes; zero/minimum adjustment boundaries; invalid provider response |
| API/database | Authorization and forged/stale previews; reservation committed before side effect; same/different-ID concurrency; cancellation races; definite rejection vs uncertain outcome; crash recovery; constraints and migration |
| Webhook/worker | Immediate successful/failed charge; scheduled change before/at/after boundary; duplicate/reordered events; old subscription delivery; missing webhook repaired by fetch; operation convergence and entitlement/cache/seat/branch consistency |
| Components | Target, dates, amounts and pending/failure copy; preserved selection across dismissal/reload; organization switching; both billing entry points |
| Browser | Retain all #640 recovery cases; add eligible immediate upgrade and scheduled downgrade variants on both pages; Hobby cancellation; unsupported methods; no duplicate purchase; no premature access |
| Merchant Test Mode | Each enabled method's real update, rejection, proration/invoice, schedule and webhook sequence, with sanitized provider evidence; doubles do not satisfy this gate |

Reproduce the original sequence: Hobby → Professional+ purchase → Corporate upgrade attempt → repeated attempt → scheduled cancellation → another paid-plan selection → reload → termination → explicitly confirmed replacement checkout. Assert subscription IDs, provider call counts, payment uniqueness and entitlements at each step. Include the eligible immediate-upgrade variant where subsequent same-tier selection performs no mutation.

Extend `e2e/tests/billing-plan-matrix.spec.ts`, `billing-same-cycle.spec.ts`, `billing-provider-failures.spec.ts`, the provider fixture, `e2e/scripts/coverage.ts` and [the acceptance matrix](./billing-e2e-coverage.md). Keep unsupported recovery expectations; add method-specific supported cases instead of globally replacing them.

Required implementation checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, relevant billing Playwright tests and `pnpm build`. Use isolated test databases. Record unavailable credentials or skipped merchant cases explicitly; do not report them as passes.

## Delivery sequence and release gates

1. **Capability evidence:** publish the method matrix and consent decision; establish at least one supported immediate path or record the release blocker.
2. **Server policy and durable execution:** contracts, direction, previews, operations and any additive migration, with unit/integration tests. Keep unverified paths disabled.
3. **Lifecycle convergence:** webhook/worker handling, financial correlation, recovery races and entitlement regression tests.
4. **UI and browser coverage:** shared confirmation/pending states on both pages, retaining #640's comparison and unsupported recovery behavior.
5. **Staging and rollout:** complete method-specific Test Mode evidence and update [the staging checklist](./billing-staging-smoke.md). Deploy compatible API/web/worker versions together after migrations; invalidate old previews and verify webhook configuration.

Any rollout switch belongs in typed `@repo/config` and `.env.example`, defaults disabled, and cannot substitute for mandate eligibility. Roll back by disabling new direct changes while continuing reconciliation of accepted operations; preserve additive data, saved targets and paid access. Monitor aged uncertain operations, failed adjustments, mismatched provider/local tiers and duplicate-charge signals without logging payment secrets.

Keep this planning PR based on #640's branch so its diff contains only this plan. After #640 merges, rebase/retarget dependent implementation work to `main`. Neither this plan nor a fallback-only implementation closes E-344. Completion requires verified immediate upgrades on supported paths, scheduled downgrades/Hobby cancellation, truthful unsupported recovery, passing checks and merchant evidence.
