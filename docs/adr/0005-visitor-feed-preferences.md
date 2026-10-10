# ADR 0005: Visitor feed preferences after phone verification

Status: Accepted
Date: 2026-10-10
Supersedes: None
Superseded by: None

## Context

The updated visitor onboarding design asks for home type and location after OTP
verification. The existing visitor profile API stores optional contact details,
which cannot represent discovery preferences. Preferences need to survive login
and use the existing taxonomy and search filters rather than a second feed engine.

## Decision

- Keep authentication in Better Auth. Show the preference form inline after a
  pending visitor verifies a phone OTP. `/onboarding` remains the recovery route.
- Add nullable home type, city and locality fields to `visitor_profile`, separate
  from address and WhatsApp. Preserve existing contacts when saving preferences.
- Expose authenticated personal-context GET and PUT
  `/api/visitors/me/feed-preferences`. The API validates active city taxonomy and
  locality ownership. Persist and activate pending visitors in one transaction.
- Home type and city are required together; locality is optional. Skip writes
  empty preferences and completes onboarding without requiring contact details.
- Translate preferences to existing shareable `/home` search parameters. Map
  Villa to property subtype and 4 BHK+ to both existing large-home BHK terms.
  Returning phone logins restore the saved filters. An explicit login callback
  takes priority so saving a project or sending an enquiry can resume.
- The live preview is advisory. Search or taxonomy outages do not prevent Skip;
  preference write failures retain selections and offer retry.

## Consequences

The migration is additive and compatible with existing contact APIs. Removed or
inactive locations fall back to broader discovery instead of invalid filters.
Feed filters remain editable, and opening `/home` directly still permits broad
discovery. This is explicit filtering, not a recommendation-ranking system.

Unsupported boards and following are not introduced. Location suggestions are
labelled by city, not described as geographically nearby. Preview counts come
from real published search results, not the design's sample count or verification
claim. Existing brand tokens and shared accessible controls take precedence over
inaccessible sample styling.
