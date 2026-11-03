# MSG91 WhatsApp authentication

Read [auth architecture](../architecture/auth.md) and
[ADR 0021](../adr/0021-msg91-whatsapp-verification.md) before rollout.

## Template setup

In MSG91, open WhatsApp → Templates → Create Template. Use:

| Setting | Value |
| --- | --- |
| Name | `tickif_otp` |
| Category | Authentication |
| Language | English, `en` |
| Code delivery | Copy code |
| Security recommendation | Enabled |
| Code expiry | Five minutes |

Submit for Meta approval and verify the status is approved before enabling live
delivery. See [MSG91's template guide](https://msg91.com/help/whatsapp/how-to-create-a-template-for-whatsapp).

The code sends the same six-digit value in the authentication body and copy-code
button parameters. Better Auth owns login verification; contact challenges are
owned by the API. Neither workflow delegates code validation to MSG91.

## Account permission failures

The creation request can fail with:

> This WhatsApp Business account does not have permission to create message template

Check the business verification state in
[Meta Business Info](https://business.facebook.com/latest/settings/business_info).
MSG91 documents verification and account eligibility requirements for authentication
templates. If the business is already verified, ask MSG91 support to check the
WABA's authentication-template eligibility and the application's permissions.
Include the WABA ID, integrated sender, template category/language and the exact
error. Keep authentication keys in the secret manager.

This failure is not resolved by changing Tickif's OTP generation or recipient.
See [MSG91's authentication documentation](https://msg91.com/help/whatsapp/whatsapp-otp).

## Configure and verify

1. Apply the generated `0089` database migration before serving contact-verification requests.
2. Set `WHATSAPP_PROVIDER=msg91` and `MSG91_KEY` (or `MSG91_KEY_FILE`).
3. Set `MSG91_WHATSAPP_NUMBER` to the integrated sender, without `+`.
4. Set `MSG91_WHATSAPP_TEMPLATE` to the approved template name and
   `MSG91_WHATSAPP_LANGUAGE=en` to match it exactly.
5. Restart the API. Production rejects incomplete messaging configuration.
6. Verify login to the entered WhatsApp number and a new onboarding/settings/profile
   contact. Check the provider delivery report as well as the application session/save.
7. Verify wrong/expired codes, resend limits and edited-number invalidation.
8. Confirm email OTP still reaches the entered email through Resend.

The worker starts retirement of the dormant booking scheduler without blocking
its health listener on Redis. Retired booking jobs are rejected even if cleanup
is delayed; unavailable Redis must leave liveness at 200 and readiness at 503.
The Swarm deployment smoke exercises this with invalid Redis credentials.
Quarantine pending
legacy production SMS jobs; never replay old OTPs through the new provider. Local
test fixtures retain the legacy queue with console delivery and telemetry disabled.

## Validation on 2026-11-02

For repeatable UI recordings, run
`pnpm --filter @repo/e2e exec playwright test --config whatsapp-evidence.config.ts`
with the isolated E2E environment. The Critical E2E workflow uploads the five
successful/failing journey recordings, screenshots and HTML report as the
`whatsapp-ui-verification` artifact for 30 days. The recordings exercise the real
application and browser with synthetic provider delivery; they do not establish
real MSG91 or Resend deliverability. Keep recordings out of Git and link the
workflow artifact from the PR.

For playback, download the separate `whatsapp-ui-mp4` artifact: unzip it and open
`index.html`, or open any numbered `.mp4` directly. These are H.264
baseline / yuv420p files for broader player support, rather than requiring WebM
support in a downloaded report. CI runs `node e2e/scripts/export-ui-videos.mjs`
after recording, checks codec metadata and fully decodes every exported MP4.
`node e2e/scripts/verify-ui-videos.mjs` then plays and seeks every MP4 in Google Chrome
from the gallery's local file URL, saving playback results and a screenshot.
The gallery uses ordinary video elements and relative files, with no report server
or JavaScript required. Recording actions are paced for easier review.

Local Chromium journeys passed for login, individual/company onboarding, personal
settings and profile contact replacement. Additional direct API bypass attempts
were rejected. These browser checks use isolated provider fixtures.

A separate real Resend email was received by the explicitly approved recipient;
the supplied code created a verified-email session in an isolated local test
database. The disposable account was removed afterwards.

The authorized real MSG91 template-creation request returned the account permission
error above. The template was not created; actual WhatsApp delivery remains pending.

On 2026-11-03 the owner created `tickif_otp` manually. An authenticated MSG91
lookup confirmed its status is `APPROVED`, category `AUTHENTICATION`, and language
`en`. Local and staging environment files now use that exact name and language.

A separate live Chromium run used the actual MSG91 provider for phone login and
personal-settings contact verification. The recipient supplied both delivered
codes. Login created a verified-phone session; contact verification saved and
survived a reload while preserving the login number. These checks used an isolated
test database. Individual/company onboarding and studio profile replacement were
covered by the earlier browser journeys with provider fixtures.

Final regression checks: workspace typecheck and lint passed; the full API suite
passed 2,163 tests with four optional provider-connectivity skips. The web suite
passed 2,324 tests; its three remaining assertions expected API port `8008` while
the local environment used `3001`. The affected auth-guard file passed all 44
tests when rerun with `NEXT_PUBLIC_API_URL=http://localhost:8008`. Other workspace
package suites passed in the preceding serial run.

## PR follow-up on 2026-11-03

The dependency audit was repaired with patched Next.js, Better Auth, Zod,
Happy DOM, Vitest, Vite and HTTP-client dependencies. `pnpm audit --audit-level=high`
now passes with zero high/critical findings; three moderate and one low advisory
remain. No advisory suppression or audit-threshold change was added. Upstream
patch guidance includes [Next.js](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw)
and [Better Auth](https://github.com/better-auth/better-auth/security/advisories/GHSA-965c-763c-88jm).

The Swarm failure exposed blocking scheduler cleanup before the worker's health
listener. Cleanup now runs asynchronously; retired booking jobs still fail closed.
`apps/worker/scripts/readiness-smoke.mjs` verifies the compiled worker against a
loopback Redis authentication-rejection fixture: liveness stays 200 and readiness
stays 503. CI runs this smoke as well as the actual Swarm credential-failure test.

Five recorded local browser journeys passed with the patched dependencies:
phone login, email login, individual onboarding, personal settings, and company
onboarding/profile contact replacement. Recordings use synthetic provider delivery.
