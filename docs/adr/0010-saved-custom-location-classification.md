# ADR 0010 — Saved custom location classification

Status: Accepted
Date: 2026-10-11
Supersedes: None
Superseded by: None

## Context

[E-367 / issue 746](https://github.com/tickifHQ/tickif/issues/746) requires saved
custom locations to appear in homepage location search. The initial implementation
registered canonical taxonomy cities on uploader save. Older projects with a
free-text `cityName` and no `citySlug` would remain absent from location facets until
an owner edited them. Requiring owner edits does not satisfy the saved-location
requirement.

Ordinary authored location changes are material edits under the
[project version architecture](../architecture/project-versions.md). The approved
`project` row and an editable `project_pending_version` can have different locations.
Copying pending location into the live row would disclose unapproved content.

## Decision

Extend the deployment seed with an idempotent derived-classification backfill.
For each non-deleted project, lock its canonical row and read both the live row
and current pending aggregate in the same transaction. Derive a missing city slug
separately from each version's own existing `cityName`, using the same identity
normalization as new taxonomy writes. Preserve the authored name, other content,
statuses, revisions, publish dates and modification timestamps. Historical audit
records remain immutable.

This narrowly scoped classification migration may update the approved projection
without entering moderation because it changes no authored location. It does not
authorize ordinary location edits to bypass moderation. Existing canonical slugs
are not replaced; invalid labels and administrator-deactivated cities are preserved
and reported as skipped. Deleted project content is excluded.

Each changed live row records an index event transactionally, participating in
the search rebuild's advisory-lock barrier. Pending-only changes enqueue no public
index event. The worker rereads the approved live projection and applies the normal
public visibility rules.

Alternatives considered were owner-driven resaves, which leave older projects
unreachable, and separate live/pending passes, which can lose the classification
when concurrent approval promotes a still-unclassified pending version. A read-only
location fallback would also require equivalent support across taxonomy options,
PostgreSQL facets and the external search projection.

## Consequences

Existing saved custom locations become canonical during `pnpm db:seed`, including
drafts that may later be submitted without an owner changing their location. The
backfill uses bounded keyset batches and short per-project transactions. It can be
rerun after interruption; already classified rows produce no duplicate index work.

Integration coverage verifies published location options/filtering, distinct live
and pending names, unchanged content and review metadata, inactive/invalid/deleted
preservation, pending-only index isolation and rerun idempotency. Deployment
acceptance still requires the seed to complete, its skip counts to be reviewed,
search outbox processing to finish, and saved custom locations to be checked on
staging. This decision does not implement geographic distance discovery.

## Amendments

None.
