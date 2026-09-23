# E-323 billing evidence

Captured from the real local Tickif web/API/database stack on 24 September 2026 after the billing UI simplification. All six screenshots and both workflow recordings are fresh. The full billing run passed 40 cases; three tests still using the old cancellation UI were adapted to the approved hidden-action behavior and passed in the focused rerun. That rerun also captured the three evidence journeys: 6/6 passed in 3.9 minutes, verifying all 43 billing cases across the two runs.

These are synthetic organizations and controlled Razorpay HTTP/Checkout fixtures, not live payments or merchant sandbox verification. Signed fixture webhooks simulate activation and billing-period termination. Immediate paid-plan changes remain gated pending verified provider capability and charge authorization. The published recordings use the supported UI throughout. Separate tests cover saving a target through the authenticated backend contract after cancellation, explicitly asserting that this action is not offered by the simplified UI.

## Screenshots

| Asset | What it shows |
| --- | --- |
| [Desktop comparison](./plan-comparison-desktop.png) | Three tiers, current plan, prices and aligned actions. |
| [Mobile comparison](./plan-comparison-mobile.png) | Stacked tier summaries at 390 px without horizontal overflow. |
| [Feature table](./plan-feature-comparison.png) | Grouped limits and features across all tiers. |
| [Recovery confirmation](./recovery-confirmation.png) | Explicit cancellation-and-save consent with the current plan retained through its verified period. Unmodified frame at 7.3 s from the recovery WebM. |
| [Saved-plan waiting panel](./recovery-target-saved.png) | One concise status panel retaining Professional+ while Corporate remains active. Removal is in the secondary menu; conflicting plan actions are hidden. Direct Playwright screenshot. |
| [Mobile waiting panel](./recovery-waiting-mobile.png) | The same waiting state and secondary menu at 390 px. Direct Playwright screenshot. |

## Workflow recordings

| Asset | Duration | Verified journey |
| --- | --- | --- |
| [Corporate checkout, dismissal, resume and activation](./corporate-checkout-dismiss-resume-activate.mp4) | 10.92 s | Hobby to Corporate directly; dismissal preserves selection; reload does not submit; Continue checkout reuses the existing subscription; activation appears automatically in the mounted dialog. |
| [Corporate to Professional+ recovery](./corporate-to-professional-recovery.mp4) | 49.20 s | UI checkout activates Corporate. Explicit cancellation-and-save retains Professional+. Both page routes are checked at desktop/mobile widths. The secondary removal confirmation is cancelled with Keep saved plan, preserving the intent and scheduled cancellation. The mounted panel automatically becomes eligible after provider termination; explicit review and payment activate the replacement. No automatic purchase or manual refresh occurs. |

The MP4s are H.264/yuv420p transcodes with fast-start metadata. No frames were fabricated, cut or reordered, and playback remains at actual automated-test speed, including the approximately 30-second polling wait. Original and transcoded recordings have matching counts and durations: checkout 273 frames / 10.92 s; recovery 1230 frames / 49.20 s, at 25 fps and 1280 x 900. Original [checkout WebM](./corporate-checkout-dismiss-resume-activate.webm) and [recovery WebM](./corporate-to-professional-recovery.webm) are retained. All six screenshots and a decoded MP4 checkout-status frame were visually inspected. The comparison and waiting-state tests cover both `/designer/plan-billing` and `/designer/plan-billing/subscribe`.

## Source tests

- `e2e/tests/billing-management.spec.ts`: `Corporate owner can compare all plans on both billing pages at desktop and mobile widths`
- `e2e/tests/billing-management.spec.ts`: `direct Corporate checkout survives provider dismissal and reload, then activates only from provider evidence`
- `e2e/tests/billing-same-cycle.spec.ts`: `Hobby purchase to Corporate preserves the paid cycle through paid-plan recovery, repeat purchase attempts, and Professional+ recovery`

Capture used a temporary ignored configuration extending `e2e/playwright.config.ts` with video recording, a 1280 x 900 viewport and 400 ms action delay. Mobile checks use 390 x 900. The isolated Typesense prefix was `tickif_e2e_align_0924`. The temporary configuration and generated Next.js files were removed, and all four stack ports were confirmed stopped. Provider keys were synthetic E2E constants; no merchant credentials or customer data were used.
