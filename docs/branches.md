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

## Migration of one-profile-per-org reads

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

Migration `0047` creates a deterministic default team for every existing org,
adds all existing org members to it, assigns existing profiles and leads, and
backfills session and invitation team context before enforcing non-null profile
and lead branch keys. Migration `0048` removes Better Auth's generated invitation
foreign key because its invitation model may encode multiple team ids in that
single field.

## Freeze rules

Downgrades freeze active teams newest-first. `freeze_rank` records that order and
restoration consumes it ascending. Freezing clears sessions that point at those
teams. Operational endpoints reject or omit frozen teams, while public profile and
published project reads deliberately do not join on `team.frozen`.

The billing webhook calls both member-seat and branch reconciliation. The same
`orgsService.reconcileBranches()` helper is available to lifecycle sweeps.
