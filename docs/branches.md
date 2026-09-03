# Branch data model

Tickif models a Corporate branch with Better Auth's `team` and `team_member`
tables. Billing, subscription lifecycle, verification, and organization roles stay
on the parent organization. Operational project, lead, profile, portfolio, review,
and search reads use the branch profile selected by `session.activeTeamId`.

Every organization has at least one team and every team has exactly one
`designer_profile`. The profile keeps `org_id` for org-level policy and owns a
unique `team_id` and public `slug`. Projects inherit their branch through
`project.designer_id`; leads store `team_id` directly because a lead may not refer
to a project.

## Active context

Authentication and platform roles are independent from the active workspace.
An authenticated user is either in personal context, represented by null active
organization and team ids, or organization context, represented by a validated
organization and team pair. The API exposes this through `GET /api/orgs/context`
and changes it through `PUT /api/orgs/context`.

The last explicit selection is stored in `user_context_preference`. A later
session restores that selection only while both organization and active-team
memberships remain valid; otherwise it repairs the preference to personal.
Membership never selects an organization implicitly, including when the user has
only one organization. Context guards remain separate from platform-role guards
so the same designer can use personal and organization capabilities safely.
Organization-only API routes validate and repair the pair before reading it.
E-249 will add the organization-context check to the designer layout alongside
the personal-to-organization chooser. Until that route exists, guarding the
layout would redirect personal users away from the only current switcher.

## Branch-scoped readers in E-244

| Previous assumption | Branch-safe behavior |
| --- | --- |
| Current profile, portfolio, dashboard | Resolve the profile from `activeTeamId`. |
| Project list, portfolio counts, writes | Filter or create through the active team profile and team membership. |
| Lead list, counts, writes | Filter by `lead.team_id`; enquiry and booking leads inherit the target profile's team. |
| `/d/{slug}` and project designer links | Resolve `designer_profile.slug`, not `organization.slug`. |
| Discovery and Typesense projections | Emit each profile's branch slug and keep footprint/reputation counters profile-scoped. |
| Reviews and project counters | Remain keyed by `designer_profile.id`, which is now the branch profile id. |
| Verification and subscription reindex | Fan out org-level state changes to every branch profile. |
| Organization workspace members | `GET /api/orgs/branches` returns only active teams with team-scoped members. |

Reports remain organization-scoped until E-246 adds its branch and organization
analytics scopes. They must not be treated as branch-scoped reads in the meantime.

Migration `0047` creates a deterministic default team for every existing org,
adds all existing org members to it, assigns existing profiles and leads, and
backfills session and invitation team context before enforcing non-null profile
and lead branch keys. Migration `0048` removes Better Auth's generated invitation
foreign key because its invitation model may encode multiple team ids in that
single field.

## Freeze rules

Downgrades freeze active teams newest-first. `freeze_rank` records that order and
restoration consumes it ascending. Freezing clears sessions that point at those
teams. The next validated organization-context request selects the user's oldest
remaining active team. Operational endpoints reject or omit frozen teams, while
public profile and published project reads deliberately do not join on
`team.frozen`.

Hard deletion through Better Auth is disabled because deleting a team cascades to
its profile and projects. Lifecycle reconciliation uses freeze and restore instead.

The billing webhook calls both member-seat and branch reconciliation. The same
`orgsService.reconcileBranches()` helper is available to lifecycle sweeps.
