# Transactional email workflows

Tickif renders React Email components on the server immediately before Resend
delivery. `packages/auth/src/email-templates.ts` owns the shared layout and typed
workflow variants; `email.ts` owns transport. Every send includes HTML and a
plain-text alternative derived from the same rendered content.

| Trigger                                   | Recipient             | Template variant           |
| ----------------------------------------- | --------------------- | -------------------------- |
| better-auth email verification link       | Account email         | `verify-email`             |
| Email sign-in OTP                         | Login email           | `otp / sign-in`            |
| Email verification OTP                    | Account email         | `otp / email-verification` |
| Password reset OTP callback               | Account email         | `otp / forget-password`    |
| Change-email OTP callback                 | New email             | `otp / change-email`       |
| Allowlisted phone OTP test delivery       | Configured test inbox | `phone-otp`                |
| Studio invitation, including resend       | Invitee               | `invitation`               |
| Invitation rejection                      | Original inviter      | `invitation-declined`      |
| Ownership transfer request                | Nominated owner       | `ownership-requested`      |
| Ownership transfer accepted               | Previous owner        | `ownership-previous`       |
| Ownership transfer accepted               | New owner             | `ownership-new`            |
| Verification approval outbox job          | Designer              | `verification-approved`    |
| Verification changes-requested outbox job | Designer              | `verification-changes`     |
| Verification approval-revoked outbox job  | Designer              | `verification-revoked`     |

Password authentication is currently disabled. The reset and change-email
callback variants are covered defensively; this change does not enable new auth
flows. There are no existing welcome, invitation-expiry, transfer-decline,
transfer-cancel, or marketing email sends. Phone SMS delivery remains separate.

Authentication owns codes, validation, and expiry (five minutes); invitations
expire in seven days. Existing recipients, subjects (except the corrected
change-email subject), idempotency keys, outbox retries, and best-effort ownership
delivery behavior are retained.

## Branding and inbox compatibility

The palette follows `packages/ui/src/styles/themes/tickif.css`: teal `#1a9b7a`,
zinc text, subtle green surfaces, and 8px corners. The dark CTA follows the
design system's inverted button and preserves text contrast. Inter and JetBrains
Mono have local email-safe fallbacks; no remote font request is required.

`apps/web/public/images/email/tickif-mark.png` is a 96px rasterization of the
existing `apps/web/app/icon.svg`, displayed at 24px alongside the Tickif wordmark.
Raster images work in email clients that don't support SVG. The wordmark and all
message content remain readable with images blocked. Deploy the web asset with
the server changes; `PUBLIC_WEB_URL` must be the publicly reachable web origin
so inbox clients can load the logo and action links.

Layout uses React Email table components and inline styles. React escapes dynamic
names, notes, and addresses; action URLs only allow HTTP(S). No template embeds
scripts, forms, remote tracking, or account secrets beyond the intended OTP/link.

## Preview and verification

Run `pnpm --filter @repo/auth emails:preview`, then open
[local previews](http://localhost:4178). All 14 HTML and text variants use
synthetic data. The command imports neither config nor Resend and cannot send
mail. `emails:export` writes the same files without starting a server. Generated
files live in the ignored `packages/auth/email-previews` directory.

`pnpm --filter @repo/auth test` verifies all variants, escaping, expiry text,
fallback links, optional content, raster asset, HTML size, and Resend's HTML/text
payload, idempotency, provider errors, and safe development logging. Existing
organization and worker tests exercise the migrated send paths.

Browser previews validate layout but do not certify every Outlook/Gmail client
or actual inbox delivery. Provider calls in tests are mocked; live delivery
requires configured Resend credentials and an explicitly selected test inbox.

Implementation references: [React Email render](https://react.email/docs/utilities/render)
and [Resend integration](https://react.email/docs/integrations/resend).
