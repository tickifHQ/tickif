# ADR 0021 — MSG91 WhatsApp authentication and verified contacts

Status: Accepted
Date: 2026-11-02
Supersedes: Temporary phone-code email forwarding described in auth architecture

## Context

The product owner requested real WhatsApp OTP delivery through MSG91, verified
WhatsApp contact edits across onboarding and settings, and complete removal of the
previous messaging integration. Email already uses Resend. The initial analysis
proposed migrating dormant booking messages; the owner clarified that the product
has enquiries and no booking messaging requirement. ADR 0003 remains in force.

## Decision

Keep Better Auth for account phone/email login and Resend for email. Send phone
codes directly through MSG91 approved WhatsApp authentication templates. Remove
shared-email phone-code forwarding and the former provider's code/config/secrets.
Do not introduce replacement booking messaging; stop its scheduler and reject its
legacy delivery jobs. Keep the local sms queue solely for existing test harnesses.

Use app-owned, hashed contact challenges scoped to user, exact E.164 number and
target. Their verified IDs are single-use, five-minute proofs consumed atomically
with contact saves. Studio/contact verification never changes a login identifier.
Unchanged historical contacts and optional deletion remain possible without OTP.
Verification and consumption timestamps live in the challenge record rather than
adding flags to every profile table; no legacy data is automatically verified.

## Consequences

API delivery fails promptly on provider rejection. Credentials and the approved
template must be configured before live testing. Automated tests use isolated
local targets; live delivery requires a real recipient. Old production queue jobs
must be quarantined and the booking scheduler removed at rollout. Challenges
contain phone data and need operational retention aligned with account deletion;
user deletion cascades. Email and publication eligibility remain independent.

## Provider validation

On 2026-11-02 the authorized authentication-template creation request for
`tickif_verification_code` (English, copy-code button, five-minute expiry) was
rejected by MSG91: the WhatsApp Business account does not have permission to
create a message template. Real delivery remains unverified until the account
can create an approved authentication template. Local E2E provider fixtures do
not establish real-world deliverability.

On 2026-11-03 the owner created `tickif_otp` manually. MSG91 confirmed it is
approved with language `en`. A live browser run using real provider delivery
completed phone login and personal-contact verification/save with codes supplied
by the recipient. This resolves the delivery blocker for the approved template.
