# Critical staging journeys

Run from a clean checkout with Node 22+, pnpm 10.33.0, PostgreSQL 16, Redis 7,
Typesense 30.2 and local MinIO available. The GitHub `Critical E2E` workflow
provisions these services and installs Chromium automatically.

```sh
pnpm install --frozen-lockfile
pnpm --filter @repo/e2e exec playwright install --with-deps chromium
pnpm --filter @repo/api build
pnpm --filter @repo/worker build
pnpm --filter @repo/e2e build:launchers
pnpm --filter @repo/e2e typecheck
pnpm --filter @repo/e2e test:e2e
pnpm --filter @repo/e2e exec tsx scripts/assert-coverage.ts
```

The launcher validates connection targets, creates the isolated database if needed,
runs migrations, seeds taxonomy, bootstraps search and creates the private bucket
**before** starting the built API, built worker and Next.js. It refuses production
mode, remote services, shared database names, Redis DB 0 and non-test search/bucket
names. Existing dev services may be reused, but their stores are separate:

| Store                                        | Default local test target               |
| -------------------------------------------- | --------------------------------------- |
| PostgreSQL                                   | `tickif_stage12_test` on localhost:5432 |
| Redis                                        | localhost:6379, DB 12                   |
| Typesense                                    | localhost:8108, prefix `tickif_e2e`     |
| MinIO                                        | localhost:9000, bucket `tickif-e2e`     |
| API / web / worker health / provider mailbox | ports 3001 / 3000 / 3002 / 3103         |

Use an empty environment or explicitly supply matching `DATABASE_URL` and
`DATABASE_URL_TEST`. `REDIS_URL_TEST`, `TYPESENSE_COLLECTION_PREFIX`, `R2_BUCKET`
and the other test connection options are defined in `packages/config/src/e2e.ts`.
The launcher overrides provider credentials with synthetic values. It never
truncates a database or flushes Redis. Fixtures remove their own records, including
retained moderation history only inside the guarded local test database.

Playwright owns the processes and stops them after the run. Do not start another
web/API instance on the same ports. A five-minute allowance applies only to cold
stack startup; normal assertions have a ten-second deadline. The photo-processing
assertion has a separate bounded worker deadline. Tests run serially and do not
retry failures. A filtered run is useful for diagnosis but cannot pass the complete
coverage gate.

## Coverage and evidence

- `authentication.spec.ts`: real phone/email OTP sessions, wrong-code rejection,
  Google callback account creation and denied consent.
- `project-moderation.spec.ts`: authenticated claim, comments, approve, request
  changes, reject and unpublish with FIFO pagination.
- `verification-lifecycle.spec.ts`: upload, private signed download, change request
  with persisted rejected state, pending resubmission, approval, expiry and renewal.
- `review-participants.spec.ts`: visitor submit/edit, admin publish/reject,
  designer disputes and both publish/remove resolutions.
- `marketplace-journey.spec.ts`: individual onboarding, editor uploads through
  presigned URLs, real worker derivatives, publication, visitor onboarding and
  discovery, persistent save/like, enquiry, lead response and billing access.
- `organization-access.spec.ts`: real invitations, acceptance, role changes,
  context switching and forbidden cross-organization mutations.
- `organization-workflows.spec.ts`: projects, leads, profile, portfolio,
  verification, analytics and billing after organization switches, including
  owner/admin/member capabilities and private direct-ID isolation.
- `consultation-participants.spec.ts`: requests, confirmation, stale-state
  rejection, completion, verified review link and cancellation persistence.
- Existing billing, personal settings, designer directory and homepage pagination
  specs remain in the same complete run.

`test-results/e2e-results.json` is checked for missing, skipped, flaky or failed
critical groups. Screenshots and failed-run traces are in `test-results/e2e` and
uploaded as the `critical-e2e-evidence` workflow artifact. The repository's ordinary
CI independently runs typecheck, lint, unit/integration tests and builds.

The Browser plugin is not available in this environment; these checks use the
repository's Playwright Chromium runner.

## Provider boundary and staging smoke

Local tests exercise real application routes, sessions, PostgreSQL, queues,
Typesense and S3-compatible storage. Only external provider boundaries are doubled:
phone OTP uses the configured console delivery adapter; Resend messages are captured
by a loopback mailbox; Google authorization/token exchange returns a synthetic
identity to the real callback. The double refuses unconfigured external hosts and
synthetic email delivery cannot reach real recipients. No provider-double flag or
endpoint is added to deployed application code.

These checks **do not validate real Google, SMS, Resend, Razorpay or Cloudflare R2
configuration**. Run the following separately on the Azure staging Docker stack
after its URL and sandbox configuration are available. Do not point this local
fixture launcher at staging.

1. Record the deployed commit, staging URL, browser, timestamp and test account IDs.
   Use the deployed stack's existing secret references; do not copy secret values
   into a report, shell history or screenshots.
2. On `/login`, deliver a phone OTP to an approved test number and an email OTP to
   an approved mailbox. Verify expiry, wrong-code rejection and successful login.
3. Complete Google consent using a configured OAuth test account, confirm the
   redirect URI matches staging, verify the account/session, then repeat denial.
4. As a designer, upload three synthetic photos, wait for processing, render each
   derivative and inspect its Cloudflare delivery origin. Verify an unsigned
   original is inaccessible and an admin's signed original expires as configured.
5. On Plan & Billing, use Razorpay **test mode** to complete checkout, verify the
   signed callback and webhook record, retry a duplicate webhook, refresh state,
   update the mandate and cancel at period end. Confirm UI and persisted plan state
   agree. Record test payment/subscription/event IDs, never credentials.
6. Trigger an invitation and a moderation notification; verify approved email/SMS
   recipients receive them and retries do not duplicate application transitions.

Capture pass/fail and provider event references for each step. Until these are
executed, provider smoke remains pending even when the local critical suite is green.

## Integration snapshot

This audit task uses a separate synthetic integration base, not merged PRs:
main `9029d46`, admin reviews `e9ff0bf`, project moderation `038d4fe`, billing
`2873822`, likes `49ae55f`, personal settings `f1d692a`, designer discovery
`8d0c594`, participant reviews `69ec866`, consultations `0af5ca1`, and the runtime
dependency fix from deployment `2b15f40`. KYC and pagination are already in that
main snapshot. Consultation follow-ups `7df2cf9`, `2d4c246` and `0dfaaf5` add the
validated response types, web type fixes and the booking CTA hydration fix found
by this browser suite. The audit12 PR targets `codex/staging-12-integration-main` so its diff
contains the harness and coverage changes. Retarget/rebase after the feature PRs
are incorporated; do not merge the synthetic integration branch as a deployment.
