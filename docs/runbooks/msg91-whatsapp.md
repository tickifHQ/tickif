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

The worker retires the dormant booking scheduler at startup. Quarantine pending
legacy production SMS jobs; never replay old OTPs through the new provider. Local
test fixtures retain the legacy queue with console delivery and telemetry disabled.

## Validation on 2026-11-02

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
