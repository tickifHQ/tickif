# Branch data model

Tickif models a Corporate branch with Better Auth's `team` and `team_member`
tables. Billing, subscription lifecycle, verification, and organization roles stay
on the parent organization. Operational profile, portfolio, review, and search reads
use the branch profile selected by `session.activeTeamId`. Project and lead lists can
also read across every active branch through organization roll-up context.

Every organization has at least one team and every team has exactly one
`designer_profile`. The profile keeps `org_id` for org-level policy and owns a
unique `team_id` and public `slug`. Projects inherit their branch through
`project.designer_id`; leads store `team_id` directly because a lead may not refer
to a project.

## Active context

Authentication and platform roles are independent from the active workspace.
An authenticated user is either in personal context, represented by null active
organization and team ids, or organization context, represented by a validated
organization membership. Organization context may select a validated active team,
or use a null team id for organization roll-up. The API exposes this through
`GET /api/orgs/context` and changes it through `PUT /api/orgs/context`. Omitting
`teamId` while changing organizations preserves the compatibility behavior of
selecting the user's oldest active branch; sending `teamId: null` selects roll-up.

The last explicit selection is stored in `user_context_preference`. A later
session restores that selection while the organization membership remains active
and, when a team is selected, the active-team membership remains valid. An invalid
or frozen selected team repairs to organization roll-up; an invalid organization
membership repairs to personal.
Membership never selects an organization implicitly, including when the user has
only one organization. Context guards remain separate from platform-role guards
so the same designer can use personal and organization capabilities safely.
Organization-only API routes validate and repair the context before reading it.
E-249 will add the organization-context check to the designer layout alongside
the personal-to-organization chooser. Until that route exists, guarding the
layout would redirect personal users away from the only current switcher.

## Branch-scoped readers in E-244

| Previous assumption                     | Branch-safe behavior                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Current profile, portfolio, dashboard   | Resolve the profile from `activeTeamId`.                                                                                                   |
| Project list and status counts          | Filter through the selected active team, or all active teams in organization roll-up.                                                      |
| Project writes and branch-profile reads | Require a selected active team and resolve its profile.                                                                                    |
| Lead list and counts                    | Filter by the selected active team, or all active teams in organization roll-up, then apply role visibility.                               |
| Lead writes                             | Require a selected active team; enquiry and booking leads inherit the target profile's team.                                               |
| `/d/{slug}` and project designer links  | Resolve `designer_profile.slug`, not `organization.slug`.                                                                                  |
| Discovery and Typesense projections     | Emit each profile's branch slug and keep footprint/reputation counters profile-scoped.                                                     |
| Reviews and project counters            | Remain keyed by `designer_profile.id`, which is now the branch profile id.                                                                 |
| Verification and subscription reindex   | Fan out org-level state changes to every branch profile.                                                                                   |
| Organization branch management          | `GET /api/orgs/branches` includes frozen state and profile summaries; managers see every branch while other members see assigned branches. |

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
teams. The next validated organization-context request preserves the organization
in roll-up context. Operational project and lead roll-ups omit frozen teams, while
public profile and published project reads deliberately do not join on
`team.frozen`.

Hard deletion through Better Auth remains disabled because deleting a team directly
cascades to its profile and projects. The owner-only Tickif removal endpoint requires
a different surviving active branch, reassigns retained operational data and search
projections atomically, and deletes the source team last. It rejects the final branch,
cross-organization or frozen targets, inactive target profiles, and review identity
conflicts. Lifecycle reconciliation continues to use freeze and restore instead.

The billing webhook calls both member-seat and branch reconciliation. The same
`orgsService.reconcileBranches()` helper is available to lifecycle sweeps.

## Branch management screens

Branches and Team & Roles are always visible in the designer sidebar, including
for lower plans and roles without member-management capabilities. Both pages use
the shared organization-management blocking card when Corporate management is
unavailable. Branches checks both the server entitlement flag and the shared
plan/state policy, and blocks the table and detail controls behind that card.
The card offers Corporate plans or billing recovery only to callers with billing
access; other members are directed to the organization Owner.

`/designer/branches` lists accessible branches in a table with branch name,
location (the profile's saved footprint), member count, an edit action and a
branch-details icon link. Current and frozen labels use the shared Badge defaults.
Member roles use the shared secondary variant for Owner and outline for all other
roles. Branch names can be searched;
member search matches name or email, case-insensitively. Both tables use API
search and pagination, defaulting to 12 rows with shared ListPagination controls.
Search and page-size changes reset to the first page; shrinking results clamp
the page. Debounced requests are canceled when superseded and stale responses
cannot replace newer data. Mutations reload the list and workspace summary.

`GET /api/orgs/branches/list` returns paged branch summaries with empty embedded
member arrays. `GET /api/orgs/branches/:branchId` reads one authorized summary,
and `GET /api/orgs/branches/:branchId/members` pages its members. Organization
members and invitations are paged through `/api/orgs/members` and
`/api/orgs/invitations`. Lists accept validated `page` (default 1), `limit`
(default 12, maximum 100), and `q` (maximum 200 characters), and return `items`,
`page`, `limit`, `total` and `totalPages`. Literal, case-insensitive SQL search
precedes pagination. Count and page queries share a repeatable-read snapshot.
Owners/Admins retain visibility of every branch; other members see assignments.
Invitation reads require member-management access. Foreign/unassigned branch
reads return not found. The summary workspace endpoint `/api/orgs/summary` omits
member/invitation arrays and provides counts and current-member identity needed
for ownership protections. Legacy `/api/orgs/branches` and `/api/orgs/current`
snapshots remain available for existing non-table callers.

Assignment choices use `/members?availableForBranchId=...` to exclude assigned
and frozen members, with management authorization. Ownership nominee choices use
`transferEligible=true`, limited to authorized owners and eligible active members.
Removal targets use `/branches/list?removalTargetFor=...` to select another active
branch with an active profile. These choices support search and pagination too.
The branch list heading has no organization-name subtitle.
The Create new branch action opens a name dialog above the table. Selecting a
branch opens `/designer/branches/[branchId]` without changing active context.
The server checks the branch with the same visibility rules as the authorized
list; unavailable branch ids return not found. Management components reset their
table and dialog state when the studio or branch identity changes.

The detail page shows members and their organization roles. Managers can add
existing, unfrozen studio members who are not already assigned, remove branch
assignments, and see organization-wide roles as read-only badges. The
"Change roles in team and roles" link sits to the right of member search and opens
Team & Roles, which owns role editing. The controls stack on narrow screens.
No branch-specific role model is introduced. Branch pages no longer offer
invitations; organization invitations remain in Team & Roles. See
[ADR 0018](../adr/0018-branch-member-management.md) and its role-editing replacement,
[ADR 0019](../adr/0019-centralized-branch-role-management.md).

Branch profile links, billing recovery and owner-only branch removal with project
reassignment remain on the
detail page. Edit and owner-only removal actions sit together in the page header;
removal still requires confirmation and an eligible reassignment target. Frozen
branches remain listed with recovery guidance on their detail.
Location, project count and portfolio status replace the organization name and
member count directly beneath the branch heading, separated by decorative dots.
An active portfolio status links to the branch's public profile.
The sidebar branch selector sits below the Tickif logo, before Studio navigation,
including in the mobile navigation drawer. Branch switching is available through
that selector; the detail page has no duplicate Switch Branch action. The
selector's visibility and switching rules stay the same.

## Team & Roles

Members and Invitations are separate tabs, with Invitations visible to authorized
managers. Both use shared searchable, paginated tables. Members show name, email,
joined date, role and actions, matching the branch member table styling. Owner
roles use secondary badges; other roles use outline badges. Existing role-action
menus exclude Owner, current-user and frozen rows and honor role-change capability.
Invitations use a dialog for sending and retain expiry, resend/revoke and
organization-wide invitation semantics. Ownership nominees use one searchable
dropdown; additional results load inside its menu, without a separate search
field or table pagination. The default-size transfer button aligns with the
dropdown. The two-party handshake and sole-owner leave restrictions remain.
See [ADR 0020](../adr/0020-paginated-organization-management.md).
