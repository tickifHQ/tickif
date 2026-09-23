# E-323 billing implementation plan — E-343 and E-344

Prepared 23 September 2026 against local HEAD `d2085951`.

Parent: [E-323: Plan comparison, immediate upgrades and scheduled downgrades](https://linear.app/tickif/issue/E-323). UI scope: [E-343: Show all plans and support direct plan selection](https://linear.app/tickif/issue/E-343/billing-show-all-plans-and-support-direct-plan-selection). Timing and recovery scope: [E-344](https://linear.app/tickif/issue/E-344/billing-fix-plan-change-timing-and-scheduled-cancellation-recovery).

The filename is retained for existing links. This draft now defines the combined delivery and acceptance criteria for the parent issue. Provider capabilities remain subject to the verification gates below.

## Scope and outcome

Show Hobby, Professional+ and Corporate together on Plan & Billing and Subscribe, with accurate prices/features, a current-plan marker, explicit upgrade/downgrade actions and explanations when an action is unavailable. Keep the user's selected target through confirmation, checkout dismissal, errors and refresh. Preserve direct Hobby → Corporate checkout.

[E-344](https://linear.app/tickif/issue/E-344/billing-fix-plan-change-timing-and-scheduled-cancellation-recovery) owns immediate upgrade timing, proration, scheduled downgrade details and cancellation/payment-method recovery operations. E-343 should expose existing limitations clearly and preserve the target for that recovery work. It must not promise immediate paid-plan upgrades while the API still schedules every paid change at cycle end.

## Findings from the pre-implementation code

- `designer-plan-billing.tsx`: `UpgradeCard` already offers both paid tiers from Hobby, but disappears for Corporate and non-active lifecycle states. It is not a complete comparison. Closing the dialog clears `initialTargetTier`.
- `subscribe/subscribe-page.tsx`: comparison is hidden behind a button. The Subscribe server page lacks the explicit billing-capability gate used by the overview page; backend mutation checks already enforce billing access.
- `subscribe/checkout-flow.tsx`: `initialFlowStep` treats every different initial target as an upgrade, can override an explicit target with `preLapseTier`, and bypasses the cancellation check in `handleSelectPlan`. Closing resets the flow; errors and Razorpay dismissal return to selection. Some states do not retain the target.
- `plan-config.ts` and `billing-types.ts` duplicate display prices. The cumulative feature helper makes Corporate inherit both “1 Seat/1 Branch” and “Unlimited Seats/Unlimited Branches”.
- `subscribe-service.ts`: direct paid-tier creation exists; plan IDs are resolved server-side. Same-tier unfinished checkout can reuse the provider subscription. A different target conflicts with an existing checkout. Row locking protects creation. Paid changes are currently deferred to cycle end; Hobby uses cancellation.
- `SubscriptionResponse` exposes current tier, lifecycle, cancellation and provider status, but not the target of an unfinished checkout. The entitlement response is cached per organization, so user-specific capabilities must not be added to that shared cache.

## 1. Frontend changes

### One visible comparison

Reuse and extend `subscribe/plan-selection.tsx` and `plan-card.tsx` on both pages. Replace the upgrade-only sidebar content with a full-width comparison section; preserve existing usage, billing history and lifecycle content.

- Desktop: three aligned plan columns following Linear's pricing layout, followed by a grouped feature comparison table. Mobile: stacked plan summaries with readable feature lists and full-width actions; no horizontal page overflow.
- Show current plan independently from selected target. Use “Upgrade to Corporate”, “Downgrade to Professional+”, “Switch to Hobby” and “Current plan” instead of generic “Select”.
- Keep current display prices: Hobby ₹0/month, Professional+ ₹2,999/month, Corporate ₹7,999/month. These are repository display values, not verified merchant plan amounts or a charge quote.
- Consolidate display pricing/labels and resolve seat/branch feature overrides instead of concatenating contradictory limits. Preserve verification qualification and avoid suggesting that buying a plan automatically grants verification.
- Keep all cards visible during lifecycle restrictions. Put an accessible explanation next to unavailable actions; reuse payment recovery and support affordances.

### Pricing-table visual reference — user direction

Use [Linear's pricing page](https://linear.app/pricing) as the visual reference. Reviewed its live desktop layout on 23 September 2026: restrained typography, evenly spaced plan columns, thin vertical dividers, subtle horizontal rules, compact feature lists and a separate grouped feature matrix. Match this structure and visual hierarchy as closely as Tickif's existing components and theme allow.

- Adapt the layout to three columns: Hobby, Professional+ and Corporate. Align plan names, monthly prices, summary sections and action areas. Use generous spacing and restrained borders rather than heavy card shadows.
- Below the summaries, show a feature-label column and one column per plan. Group verified Tickif features into workspace limits, discovery/profile, analytics, team management and support. Use explicit limit values and accessible included/unavailable indicators. Do not invent benefits to fill the table.
- Display the current-plan badge in its column header; show the selected target separately with a subtle semantic-token treatment. Keep unavailable-action reasons readable beside the action.
- Retain Tickif's monthly organization pricing, current naming and payment behavior. Linear's per-user prices, annual toggle and sales actions are not part of this design requirement.
- Mobile adaptation: keep all three plan summaries visible in stacked order. Render the detailed matrix as labelled feature groups with all three tier values per feature, using the same data as desktop; avoid squeezing four columns into a narrow viewport. This is a proposed Tickif adaptation, not a claim about Linear's mobile implementation.

Existing-component mapping:

| UI element | Reuse |
| --- | --- |
| Plan summaries and selection | Extend `subscribe/plan-selection.tsx` and `subscribe/plan-card.tsx` |
| Summary container | Existing `@repo/ui/components/card`, with supported styling overrides for a flat presentation |
| Comparison matrix | `@repo/ui/components/table` primitives with semantic row/column headers |
| Current-plan marker | `@repo/ui/components/badge` |
| Upgrade/downgrade/continue actions | `@repo/ui/components/button` |
| Section rules and optional explanations | Existing `separator` and `tooltip`; critical billing restrictions remain visible text |
| Confirmation and checkout | Existing `CheckoutFlow` and dialog primitives |

Keep the billing-specific comparison composition in `apps/web`; reuse shared primitives rather than introducing another UI kit or duplicating them. Use Tickif's semantic colors, typography, spacing and radius conventions. Browser acceptance includes comparison against the Linear reference for alignment, density and divider treatment, plus checks in Tickif's supported themes and narrow mobile widths.

### Persistent selection and correct routing

Introduce one selection controller shared by both page compositions. Keep selected tier separate from transient dialog state.

- Persist unsubmitted browsing intent only, scoped to user and active organization, in session storage. This supports refresh and navigation between the two pages without retaining payment data. Clear/reset local state on identity or organization changes; never apply another organization's selection. Accepted recovery intent is stored server-side as specified below and survives a browser-session change.
- Explicit selection takes precedence over the previous-plan recovery default. Use `preLapseTier` only when the user has not chosen a target.
- Route initial selections and card clicks through the same resolver: current plan, upgrade, downgrade, Hobby cancellation, recovery, or blocked action. Apply cancellation/lifecycle checks to every entry point.
- Carry target through processing, error, dismissal, pending activation and cancellation-scheduled states. “Retry Corporate” retries that intent; “Choose another plan” changes it deliberately.
- Closing Tickif's dialog to open Razorpay must not clear selection. Dismissing Razorpay must not cancel the subscription or silently choose another plan.
- After reload, reconcile server state before offering Continue. Never reopen Razorpay, submit payment or repeat a mutation automatically. If the target is now current, clear the completed intent. If activation remains pending, offer refresh/status rather than another purchase.
- Refresh billing after accepted mutations and provider confirmation. Avoid stale asynchronous responses updating a different organization's screen.

### Permission and lifecycle behavior

Apply the overview's `getCurrentOrgCapabilities` / `hasBillingAccess` guard to the Subscribe server page. Preserve access-denied behavior; this ticket does not broaden visibility of sensitive billing data.

| State | Comparison/action behavior |
| --- | --- |
| Active Hobby | Both paid tiers selectable directly; Hobby marked current |
| Active Professional+ | Corporate upgrade; Hobby cancellation confirmation |
| Active Corporate | Professional+ downgrade; Hobby cancellation confirmation |
| Payment failed / grace / halted provider state | Cards remain visible; explain payment recovery requirement and reuse Update Payment Method |
| Locked | Show suspension and recovery action; do not present ordinary plan switching as available |
| Downgraded | Hobby current; paid recovery selection retained; provider state determines whether checkout is permitted |
| Cancellation scheduled | Show current access-until date and selected target; explain blocked change; recovery mechanics remain E-344 |
| Existing unfinished checkout | Resume its verified target; explain conflicting selection without creating another subscription |
| Unknown/provider unavailable | Keep comparison visible, preserve intent, disable dependent actions and offer retry |

## 2. Backend and contract changes

Reuse `/subscribe`, `/change-plan`, `/cancel`, `/verify-payment` and subscription refresh. No new payment-creation mechanism is needed.

Recommended small addition: a billing-access-protected `GET /api/billing/selection-context`, with its Zod response in `packages/contracts/src/billing.ts`, returning current action availability and verified unfinished-checkout context. Keep this separate from the general organization entitlement cache.

- Return per-tier action (`current`, `subscribe`, `change_plan`, `cancel`, `recover`, `blocked`) and stable reason codes for unavailable actions, plus unfinished checkout target/status when known. Model unknown provider state explicitly; do not infer absence from a fetch failure.
- Derive the checkout target from the existing provider subscription and configured plan mapping. Reuse existing client calls and repository reads. Do not return hosted checkout URLs to callers without billing access.
- Reuse the same eligibility rules in mutation services, which must re-check current state under existing locking. A previously fetched context is guidance, not authorization.
- Add a stable error code/details for conflicting unfinished checkout so the UI can offer the correct resume path. Preserve the requested target separately when explaining the conflict.
- Reuse a same-target checkout only when its provider plan can be resolved and matches the request. Fail safely on an unknown mapping; never relabel an unknown checkout as Corporate.
- Preserve billing-role checks, server-side plan-ID resolution, organization isolation, concurrency protection and provider-confirmed entitlements. Neither URL/storage intent nor checkout success alone grants access.
- Follow routes → service → repository, `requireAuth` route middleware, shared contracts and typed `hc` calls. Mount any new route in the exported `app` chain.

E-343's comparison and selection changes alone need no database migration. The combined plan includes durable recovery state under E-344, with a generated, reviewed migration. Reuse the existing lifecycle worker/reconciliation mechanisms where possible; extend them when needed to reconcile recovery eligibility without requiring the user to keep the page open. No automatic purchase is triggered by a worker.

### Durable recovery intent — E-344

Store accepted recovery intent in an organization-scoped billing recovery record, separate from current entitlement and provider-scheduled changes. Include target tier, source subscription ID, initiating actor, status, verified eligible-at date (nullable), timestamps and a revision for concurrent edits. Permit at most one open recovery intent per organization through a database constraint; retain terminal records for reconciliation history.

- Create/update intent only through an authenticated billing mutation after explicit recovery confirmation, never from a preview read or a browser refresh. Persist the request before its provider operation, then reconcile the provider outcome; a timeout must remain uncertain until fetched, not be treated as a failed cancellation.
- Use statuses that distinguish requested, waiting for expiry, eligible, checkout pending, completed, dismissed and superseded. Provider failures and unknown outcomes must be visible with a retry/reconciliation reason.
- On reload or another authorized billing user's visit, return the accepted intent from selection context. Unsubmitted local selection may be shown separately but cannot silently replace it. An organization switch clears local state, not the organization's saved record.
- Changing or dismissing accepted intent requires a deliberate billing action with the expected revision. Explain that dismissing intent does not revoke an existing provider cancellation or scheduled update. If checkout is already live, apply existing checkout-conflict/reuse rules before accepting another target.
- Mark eligible only after verifying that the old subscription permits a safe replacement; the arrival of a stored date alone is insufficient. Require fresh checkout confirmation and authorization. Complete only after the selected target is provider-confirmed active; retain intent on failed or abandoned checkout.
- If another confirmed plan change makes the intent obsolete, reconcile it as completed or superseded and explain the result. Never restart it automatically. Enforce current billing permissions for every read and mutation.

### Change preview and confirmation contract — shared UI, E-344 backend

Define a Tickif-owned preview contract in `@repo/contracts`; this is not an assumption that Razorpay offers a quote API. A preview contains the organization/source subscription, current and requested tiers, supported operation, timing, effective date and next renewal, next eligible action/date, capability reason, recurring amount, adjustment amount/currency/direction, amount certainty (`confirmed`, `estimated`, `unavailable`), preview expiry and a server-verifiable state revision/token. Read-only selection context and an explicit target preview may share the underlying service.

- Show recurring price separately from today's adjustment, refund and next renewal. Show known limitations before confirmation. Unknown dates or charges are labelled unknown, never represented as zero.
- Submit the target, preview token and stable operation ID to the mutation. Re-read provider/local state and re-check permissions under existing serialization before any charge-affecting request. Reject stale/expired previews with a stable `preview_stale` conflict and fresh context; do not silently change the requested operation.
- Require a new review and explicit confirmation when the target, source subscription, eligibility, timing, effective date, currency, amount/direction or amount certainty changes. Crossing a proration boundary invalidates the preview. Never automatically resubmit after a stale-preview rejection.
- **Monetary consent policy:** enable a charge-affecting confirmation only with a verified amount or a tested bounded estimate whose maximum is displayed and explicitly accepted. If the integration cannot keep the provider charge within that authorization, do not execute that immediate-change path; explain the limitation and offer the verified deferred recovery path. An unbounded estimate or unavailable amount is insufficient consent. Establish the enforceable mechanism in Phase 1; do not imply a local cap is enforced by Razorpay without evidence.
- Reconcile an operation with an uncertain provider outcome before allowing a retry. Repeated submissions of the same operation ID return the existing operation status and cannot initiate another charge. Record actual provider invoice/payment/refund values independently from the estimate.
- Return explicit outcomes: requested/processing, scheduled (target plus verified effective date), activated (confirmed current plan), failed (old access retained where applicable) or reconciliation pending. “Scheduled” never means “activated”; client success callbacks do not grant entitlements.

## 3. Razorpay constraints and verification

The available Razorpay MCP is read-only and exposes payments/orders/refunds/settlements/links, but no plan or subscription lookup/update tools. No merchant transactions were inspected or changed for this plan; unrelated payment records cannot establish subscription-update capabilities.

Official [Razorpay subscription update documentation](https://razorpay.com/docs/payments/subscriptions/update/?preferred-country=IN) restricts domestic-card subscriptions to offer updates and disallows updates in created/pending/halted states. Retain existing limitation handling and do not assume that exposing a plan card makes a provider operation supported. Exact recovery operations and timing verification remain E-344.

Before release, use the existing test-mode integration setup to confirm the configured Corporate plan amount/currency/interval and run Hobby → Corporate checkout, dismissal/resume and delayed activation. A mocked browser test cannot establish merchant configuration or actual payment-method support.

## 4. Test and acceptance plan

Start with failing regression tests for target loss, incorrect initial downgrade routing, recovery overriding explicit selection and initial-target cancellation-guard bypass.

- Extend `apps/web/tests/components/designer-plan-billing.test.tsx`, `subscribe-page.test.tsx` and `subscribe-flow.test.tsx`: all three current tiers, all lifecycle rows above, billing permission denial, contradictory feature limits, cancel/reopen, error/retry, refresh, invalid persisted target and organization switch.
- Extend API subscribe service/routes/checkout tests and add selection-context coverage: direct Corporate plan mapping, same-target reuse, conflicting/unknown provider target, concurrent repeated clicks, provider outage, 401/403 and cross-organization access. Verify no paid entitlement before authoritative activation.
- Extend `e2e/tests/billing-management.spec.ts`: both pages expose all plans; Hobby → Corporate sends only Corporate to subscribe; dismiss/retry/reload retain Corporate; Corporate → Professional+ enters downgrade confirmation; paid → Hobby enters cancellation confirmation; scheduled cancellation blocks shortcuts.
- Browser checks at desktop and narrow mobile widths: no clipping/overflow, visible prices/features/current marker, keyboard selection, focus restoration, screen-reader labels and explanations for disabled actions.
- Run focused tests, then required `pnpm typecheck`, `pnpm lint`, `pnpm test`, relevant billing Playwright coverage and test-mode smoke verification. Record infrastructure-dependent failures distinctly from passing checks.

### E-323 end-to-end acceptance matrix

Exercise both billing entry points and the desktop/mobile comparison. Assert backend state, actual provider evidence where applicable and visible UI outcomes; reaching a confirmation dialog alone does not pass a transition test.

| Journey | Required completed outcome |
| --- | --- |
| All current tiers | All three plans remain visible with correct current marker, prices/features and role/lifecycle-aware actions |
| Hobby → Corporate | Only Corporate is requested; no intermediate Professional+ purchase; dismissal/error/reload retain the target; verified activation updates access and current marker |
| Supported Professional+ → Corporate | Known timing/adjustment reviewed; authorized provider adjustment succeeds; Corporate activates after provider confirmation without waiting for next renewal; failed adjustment retains the prior plan |
| Corporate → Professional+ | Supported scheduled change shows target/date; Corporate access remains until the verified boundary; completed transition updates entitlements and marker to Professional+ |
| Paid → Hobby | Cancellation preserves paid access until the verified end; Hobby becomes current after provider-confirmed termination; repeated cancellation does not create another operation |
| Unsupported mandate / scheduled cancellation | Explain limitation before confirmation; preserve accepted target across session loss; show next action/date; verify expiry, explicitly continue the selected checkout and complete activation without overlapping live subscriptions |
| Repeated attempt regression | Upgrade attempt → second attempt → schedule cancellation → try another change → reload → provider transition → selected checkout completes with the correct retained target and access throughout |
| Stale preview / concurrent billing user | State or monetary change requires renewed confirmation; stale requests perform no provider mutation; concurrent intent edits are detected rather than overwritten |
| Failure / timeout / duplicate or out-of-order event | Reconcile uncertain outcomes; never duplicate subscriptions or charges, grant early access, regress to stale entitlement state or label an unconfirmed transition complete |

Use controlled provider fixtures for deterministic boundary/failure tests and test-mode evidence for each supported real payment path. If no usable immediate-upgrade path or enforceable charge authorization can be verified, record that as an unresolved E-344/E-323 release blocker rather than treating every upgrade as deferred and closing the parent.

## E-323 delivery sequence and completion gates

| Phase | Owner | Work and exit criterion |
| --- | --- | --- |
| 1. Provider verification and shared contract | E-344 + E-343 | Verify merchant plan amounts/currency/interval and supported payment-method operations in test mode; establish adjustment authorization, event payloads and recovery operations. Finalize preview/outcome contracts and operation/recovery state model; unsupported paths have explicit next actions. |
| 2. Comparison and selection | E-343 | Implement Linear-style comparison with existing primitives, permission guards, shared selection controller and session persistence. Regressions pass for all tiers, both entry points and mobile. |
| 3. Timing and reconciliation | E-344 | Implement server-side upgrade/downgrade timing, monetary preview validation, operation deduplication, provider-confirmed activation and scheduled transition reconciliation. Supported immediate-upgrade and cycle-end downgrade tests reach completion. |
| 4. Durable recovery | E-344 | Add recovery schema/migration, lifecycle reconciliation and explicit resume/replace-intent controls; preserve old access and prevent overlapping subscriptions. Recovery survives session loss and completes selected checkout. |
| 5. Integrated frontend | E-343 + E-344 | Wire every comparison action to the same preview/eligibility rules; show effective dates, adjustment certainty, scheduled/activated outcomes and recovery actions. Refresh after mutations and provider confirmation. |
| 6. Parent verification | Both children | Pass the complete E-323 matrix, relevant browser tests, test-mode smoke checks and `pnpm typecheck`, `pnpm lint`, `pnpm test`. Record evidence and resolve material failures before closing the parent. |

The children may ship in separate PRs, but comparison-only delivery does not complete E-323. Keep E-323 open until both children and their integrated journeys pass. Proposed implementation defaults: retain billing access restrictions; use session storage for browsing only and server persistence for accepted recovery; resume matching checkout safely; preserve paid access until verified transition; require explicit confirmation before a replacement purchase. Automatic replacement of an unfinished checkout remains outside this plan.

Implementation is in progress in the accompanying working tree. The comparison UI, signed previews, durable operations/recovery, provider reconciliation and generated migration are implemented. Automated validation is recorded below when complete. Merchant configuration and real provider payment behavior remain unverified; no merchant mutation has been performed. Direct paid-plan updates remain gated by the unresolved provider capability and monetary-consent requirements above.

## Follow-up review: mid-cycle changes and unused value

Reviewed official India documentation on 23 September 2026. These findings expand the E-344 dependency; they do not change E-343 into a payment-engine implementation.

### Provider behavior

For supported immediate changes, unused value offsets the new cost. A positive difference is invoiced/charged; a negative difference is automatically refunded through a credit note. Failed adjustment charges leave the subscription unchanged. Same-frequency changes preserve the cycle; changing frequency starts a new cycle. Cycle-end updates require no adjustment. The guide documents `subscription.updated` and a minimum nonzero adjustment of ₹0.50; verify boundary behavior in test mode. [Razorpay update guide](https://razorpay.com/docs/payments/subscriptions/update/?preferred-country=IN).

The API supports `schedule_change_at: now | cycle_end`. UPI/eMandate updates are unsupported; offer-linked downgrades must occur at cycle end. [Update API](https://razorpay.com/docs/api/payments/subscriptions/update-subscription/?preferred-country=IN). Domestic cards permit only offer updates, per the update guide. UPI also lacks subscription additional-charge support. [Subscriptions FAQ](https://razorpay.com/docs/payments/subscriptions/faqs/?preferred-country=IN).

Cancelling a pending plan update is a separate operation from cancelling the subscription: `/cancel_scheduled_changes` removes an unapplied update. Do not use it as an assumed reversal of `cancel_at_cycle_end`. [Cancel update API](https://razorpay.com/docs/api/payments/subscriptions/cancel-update).

### Tickif-specific implications and proposed policy

1. **Supported paid upgrades:** use the provider's immediate update/adjustment path after capability verification. Do not also collect the full target price through a separate payment; that would risk double charging.
2. **Paid downgrades:** retain cycle-end scheduling. **Hobby:** retain cycle-end cancellation. This lets customers consume their purchased access without introducing a Tickif credit balance.
3. **Unsupported mandates:** show a replacement-subscription flow only after designing transition timing and obtaining fresh authorization. The reviewed documentation does not establish automatic unused-value transfer between two subscription IDs. Do not promise it. An immediate replacement would need an explicit refund/credit policy, reconciliation and overlap prevention; the simpler default is switching after existing access expires.
4. **Amounts:** use integer paise internally. Base any estimate on verified provider plan, quantity, cycle and discounts, not the static frontend price. Distinguish recurring price, estimated adjustment, actual payment and refund. Exact rounding, month boundaries and configured tax treatment require test-mode verification. Existing comments claiming GST inclusion are not merchant-configuration evidence.
5. **Review UI:** show effective date, next renewal, recurring amount and separately labelled adjustment estimate/actual amount. `ReviewPayStep` currently shows the full target monthly amount and a Checkout CTA even for a paid change. Give paid changes their own confirmation wording; do not label monthly price as today's charge.

### Backend gaps to cover in E-344

- `subscribeService.changePlan` always passes `cycle_end`. Choose timing server-side only after resolving provider support.
- `RAZORPAY_EVENT` and `processWebhookEvent` lack `subscription.updated`. Validate available webhook configuration/payloads in test mode; add idempotent update reconciliation and refresh fallback. Never rely on receiving another recurring charge to recognize a successful immediate change.
- Existing tier inference includes payment-amount fallbacks. Prorated payments cannot identify a tier reliably. Use verified plan mapping for adjustments; handle unknown mappings explicitly.
- Model requested target, confirmed current target and scheduled target separately. Extend provider parsing for scheduled-change metadata and retrieve pending details when needed. Avoid reporting a scheduled change as already active.
- No provider quote/preview operation was established by this review. Implement the Tickif preview contract and monetary consent policy above; verify an enforceable amount/bound before enabling a charge-affecting path.
- After timeouts, fetch provider state before retrying an update. Test duplicate/out-of-order events and reconcile actual invoice/payment/refund records without manufacturing a successful payment from an entitlement change.

### Additional validation cases

Test supported immediate upgrade success/failure; small and zero adjustments; first/last-day and unequal-month boundaries; changed quantity/discounts; scheduled downgrade and cancellation of that update; UPI, domestic-card and eMandate rejection; stale provider events after successive changes; and replacement checkout without transferred credit or overlapping access. Verify actual invoice and refund amounts in test mode before finalizing monetary UI copy.

Merchant-specific capability, tax configuration and live proration remain unverified: the available MCP does not expose subscription/plan reads or mutations. No payment, cancellation or refund was initiated.

## E-344 alignment review

Re-read [E-344](https://linear.app/tickif/issue/E-344/billing-fix-plan-change-timing-and-scheduled-cancellation-recovery) and its comments on 23 September 2026. Verdict: the proposed product direction aligns, but the current implementation does not satisfy the full issue. E-343 alone cannot close E-344 or parent E-323. This is a source-code review, not an executed end-to-end verification.

| E-344 requirement | Pre-implementation behavior | Required combined workflow |
| --- | --- | --- |
| Immediate upgrades on supported paths | All paid changes use `cycle_end` | Server selects timing by tier direction and verified capability |
| Cycle-end paid downgrade / Hobby cancellation | Existing operations use cycle-end timing | Preserve access until confirmed transition; retain regressions |
| Accurate target, effective date and adjustment before confirmation and while pending | Monthly price shown; paid-change acknowledgment says cycle end without an exact date | Return target, timing, effective date, amount certainty and pending outcome from the backend |
| Limitations clear before confirmation | Domestic-card/UPI handling occurs after the change request fails | Preflight known restrictions; unknown support is explicit, with safe rejection handling |
| Scheduled-cancellation recovery | Service rejects; UI explains expiry but does not retain a recovery target | Offer supported reversal only when verified; otherwise show target, next eligible action and date |
| Preserve target through recovery/reload | Close/error/cancellation states lose intent | Shared E-343 controller plus durable accepted recovery intent owned by E-344 |
| Refresh after mutations and webhooks | Some mutations refresh on Done; refresh reconciliation exists | Refresh on accepted mutation, reconcile pending state, and refresh visible state after confirmation |
| Prevent duplicate charges and premature access | Row locking and provider-confirmed entitlements are existing safeguards | Extend reconciliation/idempotency coverage to immediate adjustments, recovery and repeated actions |
| Sandbox and regression evidence | Not exercised during planning | Execute E-344 timing/recovery tests and required workspace checks before claiming completion |

### Corrections to make the workflow complete

1. Extend the proposed selection context with E-344-owned change-preview information: requested target, supported operation, `now`/`cycle_end` timing, effective date (nullable when unknown), next eligible action/date and reason code. Include recurring price separately from adjustment amount, currency and whether the amount is estimated, confirmed or unavailable. Final mutation revalidates the preview against live state.
2. Detect known payment-method restrictions before asking for confirmation. Do not claim a plan change is supported merely because the provider status is active. If capability cannot be established, explain that uncertainty; do not promise immediate access or a specific charge.
3. Replace a generic cancellation dead end with an explicit recovery status such as “Corporate selected; current Professional+ access ends on [verified date]; continue to Corporate checkout after the current subscription ends.” If the date is unavailable, say it is unconfirmed and offer refresh/support. Do not fabricate a date or automatically initiate checkout on expiry.
4. Persist an accepted recovery target when a wait extends beyond the browser session. Keep it separate from current entitlement and scheduled provider changes. Reconcile completion and user changes, and enforce organization billing permissions on every action.
5. Treat “Plan change scheduled” and “Plan activated” as separate outcomes. The existing scheduled-success copy is accurate for today's backend; it must become outcome-driven when E-344 adds immediate upgrades.
6. Explicitly reproduce E-344's sequence: upgrade attempt → second attempt → schedule cancellation → try changing again → reload → complete provider transition → continue selected-plan checkout. Verify current paid access, target retention, correct next action/date and absence of duplicate subscriptions/payments throughout.

E-344 explicitly permits an exact deferred recovery path when immediate switching or cancellation reversal is unsupported. Therefore waiting until expiry is compatible only when that limitation, retained target and next action/date are clear. A generic “wait until period end” rejection by itself is incomplete. Cancelling a scheduled plan update must not be confused with revoking subscription cancellation.

Delivery recommendation: agree the shared contracts/state model first, implement E-343's comparison/selection separately from E-344's financial lifecycle, and validate their integrated flow before declaring the parent workflow complete. Linear-style pricing presentation does not conflict with E-344; each column's action must follow the same backend eligibility and preview data as checkout.

## Implementation record — 23 September 2026

- Both billing pages now show all three tiers, responsive grouped comparisons, backend eligibility, saved selections and recovery notices using existing UI components.
- Mutations require an expiring, actor/organization/state-bound signed preview and durable operation ID. Stale state requires review again; unknown provider outcomes block duplicate attempts.
- Recovery intent is committed before cancellation, revision checked, organization scoped, and reconciled on visits and by the worker. Provider termination is required before replacement checkout, and activation remains provider authoritative.
- Provider responses and configured plan mappings are validated. `subscription.updated` reconciles live state; payment amounts and notes cannot establish plan entitlement.
- Generated migration `0069_lethal_chamber.sql` was reviewed and applied to isolated local test databases. No merchant configuration or real payment operation was changed.
- Validation: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass (all 14 workspace test tasks successful). API: 1,825 tests passed, four skipped; frontend: 1,274 passed; worker: 186 passed. All 43 billing E2E tests pass with zero skipped or flaky cases. The expanded [acceptance matrix](./billing-e2e-coverage.md) covers every plan pair on both pages, same-cycle cancellation/recovery and repeat purchases, concurrency, stale previews, provider failures, lifecycle restrictions and verified activation. It found and fixed Subscribe refresh unmounting and eligible recovery-target replacement after the local provider ID is cleared. Lint reports existing warnings, no errors. Merchant connectivity tests remain skipped without dedicated Test Mode credentials.

Release remains blocked for direct paid-plan switching: neither an enforceable adjustment-charge bound nor sufficient mandate eligibility evidence was established. The implementation offers explicit deferred recovery and must not be treated as completion of E-344/E-323's supported immediate-upgrade requirement. See [staging checks](./billing-staging-smoke.md) for merchant-side verification and webhook deployment requirements.
