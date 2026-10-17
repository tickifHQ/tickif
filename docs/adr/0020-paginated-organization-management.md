# ADR 0020 — API search and pagination for organization management

Status: Accepted
Date: 2026-10-18
Supersedes: The client-list pagination mechanism described in ADR 0019
Superseded by: None

## Context

The branch tables originally filtered complete authorized snapshots in the browser.
The user now requests database-backed search and pagination for branches, branch
members, organization members and invitations, alongside a Team & Roles refresh.
Loading every membership and branch assignment to show one page does not scale.

## Decision

Add bounded, validated list endpoints with `page`, `limit` and literal,
case-insensitive `q` search. Apply authorization and search before counting and
paging in SQL. Return filtered totals, effective page and total pages, clamping
pages after removals. Use deterministic secondary ordering and a consistent read
transaction for each count/page pair. Branch summaries omit embedded members.

The management screens use the new endpoints and a summary workspace read.
Existing full snapshot endpoints remain available for the branch switcher,
analytics and existing callers. Assignment, reassignment and ownership nominee
choices also use paged searches rather than loading complete member lists.

Team & Roles uses Members and Invitations tabs, shared tables, search and
pagination. Members show name, email, joined date, role and actions. Existing
authorized managers can change non-owner roles; Owner protection and the
two-party ownership transfer remain unchanged. Invitations retain their existing
organization-wide delivery and acceptance workflow.

## Consequences

Table search and pagination now request bounded data from the API. Aborted or
stale responses cannot replace newer results. Mutation refreshes reload the
relevant list and workspace counts. The legacy snapshot compatibility endpoints
remain unbounded; their existing non-table consumers are outside this migration.
No permission, schema or membership data migration is required.
