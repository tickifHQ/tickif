# ADR 0018 — Branch tables and direct member assignment

Status: Accepted
Date: 2026-10-17
Supersedes: None
Superseded by: [ADR 0019](./0019-centralized-branch-role-management.md), for inline role editing only

## Context

The branch screen previously combined branch cards, expandable member lists,
creation, invitations and branch assignment on one page. User feedback requests
a branch table and a dedicated branch subpage for member and role management,
explicitly removing the invitation flow from this surface.

## Decision

List branches with name, location, members and edit columns, with creation above
the table on the right. Open a branch detail route from its name or row. Add
existing active organization members directly through Better Auth team assignment;
exclude people already assigned and frozen memberships. Remove branch invitation
UI and its mutation handler. Keep organization onboarding invitations in Team &
Roles, preserving that separate workflow and its API.

Use the existing organization role capability and update-member-role endpoint
from the members table. Explain that role changes apply across the studio.
Branch-local roles would require a separate authorization model and are outside
this requested UI change. Protect owner roles and retain existing authorization,
freeze, billing and branch removal rules.

## Consequences

Branches have a dedicated member management URL without changing the user's
active branch merely by viewing it. Members can be assigned without invitation
delivery or acceptance. People outside the organization must first become studio
members through the existing Team & Roles workflow. Role updates affect every
branch where the member participates. Existing memberships and pending
organization invitations are preserved; no data migration is needed.

## Amendment — 2026-10-17

Later user feedback replaces branch role selectors with read-only badges and a
link to Team & Roles. [ADR 0019](./0019-centralized-branch-role-management.md)
records this replacement; the branch tables, assignment and invitation decisions
above remain in force.
