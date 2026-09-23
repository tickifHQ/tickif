# E-323 billing evidence

Captured from the real local Tickif web/API/database stack on 23 September 2026 with Chromium. The three selected Playwright tests passed in 33.6 seconds. Desktop recordings use a 1280 × 900 viewport and 150 ms action delay; the mobile comparison uses 390 × 900.

These are synthetic test organizations and controlled Razorpay HTTP/Checkout fixtures. The recordings do not show a live Razorpay checkout, a real payment, or merchant sandbox verification. Signed fixture webhooks simulate activation and the end of a billing period; the application then reconciles the corresponding state. Immediate paid-plan changes remain gated pending verified provider capability and charge authorization.

## Screenshots

| Asset | What it shows |
| --- | --- |
| [Desktop comparison](./plan-comparison-desktop.png) | All three tiers, prices, current-plan marker and backend-dependent actions. |
| [Mobile comparison](./plan-comparison-mobile.png) | Stacked plan summaries at 390 px without page overflow. |
| [Feature table](./plan-feature-comparison.png) | Grouped limits/features, including Corporate seat/branch overrides. |
| [Recovery confirmation](./recovery-confirmation.png) | Explicit cancellation and saved-target consent, verified test date, separate recurring/adjustment values and the provider limitation. Unmodified frame extracted at 2.2 s from the recovery recording. |
| [Saved recovery](./recovery-target-saved.png) | Professional+ retained while Corporate access continues; no automatic replacement purchase or unused-value transfer promised. Unmodified frame extracted at 2.4 s from the recovery recording. |

## Workflow recordings

| Asset | Duration | Verified journey |
| --- | --- | --- |
| [Corporate checkout, dismissal, resume and activation](./corporate-checkout-dismiss-resume-activate.mp4) | 4.72 s | Hobby → Corporate directly; provider dismissal preserves the target; reload does not submit automatically; explicit resume reuses the existing checkout; signed provider activation updates the current marker. |
| [Corporate → Professional+ recovery](./corporate-to-professional-recovery.mp4) | 7.88 s | Hobby checkout first activates Corporate. Professional+ selection explicitly schedules cancellation and saves recovery. Repeat purchases during the paid cycle are rejected. After fixture-confirmed termination, an explicit replacement checkout activates Professional+; a stale old-subscription event cannot restore Corporate. |

The MP4 videos were transcoded from the original Playwright WebM recordings to H.264/yuv420p with fast-start metadata for browser playback. No frames were fabricated, cut or reordered, and playback remains at actual automated-test speed. Both formats contain the same frame counts and durations: 118 frames / 4.72 s and 197 frames / 7.88 s, at 25 fps and 1280 × 900. Pause to inspect intermediate review states. The original [checkout WebM](./corporate-checkout-dismiss-resume-activate.webm) and [recovery WebM](./corporate-to-professional-recovery.webm) remain available for provenance. The first three PNGs are direct Playwright screenshots; the two recovery PNGs are extracted frames from the original recording.

## Source tests

- `e2e/tests/billing-management.spec.ts`: `Corporate owner can compare all plans on both billing pages at desktop and mobile widths`
- `e2e/tests/billing-management.spec.ts`: `direct Corporate checkout survives provider dismissal and reload, then activates only from provider evidence`
- `e2e/tests/billing-same-cycle.spec.ts`: `Hobby purchase to Corporate preserves the paid cycle through paid-plan recovery, repeat purchase attempts, and Professional+ recovery`

Capture used a temporary ignored configuration extending `e2e/playwright.config.ts` with `video: { mode: 'on', size: { width: 1280, height: 900 } }`, a matching viewport and `launchOptions: { slowMo: 150 }`. The configuration and generated Next.js files were removed after capture. Provider keys were synthetic E2E constants; no merchant credentials or customer data were used.
