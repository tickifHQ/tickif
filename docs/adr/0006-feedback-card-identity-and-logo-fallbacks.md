# ADR 0006 — Feedback card identity and apartment logo fallbacks

Status: Accepted
Date: 2026-10-10
Supersedes: None
Superseded by: None

## Context

The 10 October staging audit found that the newer landing layout reintroduced
studio names and tags removed by feedback item 8 / PR #595. The public portfolio
also repeated the studio name in its navigation, main heading and adjacent hero
card, conflicting with item 41. The user requested that these reported gaps be
fixed against the current deployment, which takes precedence over the conflicting
sample text in the earlier Figma layout.

Item 22 originally requested actual logos for every configured apartment. The
existing list instead used initials. Casagrand First City has an identifiable
property logo on its official site. A reliable property-specific asset was not
established for Prestige Lakeside, and Maitri Apartments and Sea View cannot be
identified uniquely from their names alone. The user explicitly instructed:
"if logos arent idetifiable then default to existsing behaviour".

## Decision

- Apply the compact, one-line title and location-only metadata treatment to both
  landing and overlay discovery cards. Keep budget and navigation behavior.
- Keep the public portfolio's main studio heading as its primary identity.
  Navigation retains its logo/initials, accessible studio link name and location;
  the adjacent photo card says "Selected work". The separate sharing card and
  footer remain self-contained when reached further down the page.
- Configure real property logo assets where their identity is established.
  Retain the existing initials for entries without an identifiable asset and
  when an image fails to load. Do not substitute a developer's corporate logo or
  invent an apartment logo. Custom names continue without an unrelated logo.

Alternatives were retaining the conflicting sample layout, removing useful
navigation/photography, or guessing apartment identities. Those alternatives
would either leave the requested gaps or misrepresent the property.

Acceptance: the feedback corrections are authorized by the user's request to fix
the reported gaps; the initials fallback is explicitly accepted on 10 October.
This acceptance does not claim that the new code has been deployed or visually
approved on staging. Track those checks separately in the verification report.

## Consequences

The layout deliberately differs from the earlier sample text while retaining its
composition. Missing apartment assets no longer block the selector or require
false branding. Additional logos can be added to the existing configuration as
their identity is confirmed, without changing stored apartment names.

Asset provenance: `apps/web/public/images/apartments/casagrand-first-city.png`
is the unmodified 134 × 40 logo from
https://firstcity.casagrand.co.in/wp-content/uploads/2020/09/logo.png,
referenced by https://firstcity.casagrand.co.in/digilive/ on 10 October 2026.

## Amendments

None.
