# ADR 0007 — Project views replace likes

Status: Accepted
Date: 2026-10-10
Supersedes: None
Superseded by: None

## Context

Project appreciation was implemented independently of saved projects, but the
product requires views and saves instead of likes. Only image-detail pages emitted
project-view events; canonical project pages did not. Raw events have a 400-day
retention limit, so their count cannot serve as a lifetime public total.

## Decision

- Remove the likes API, contracts, client state, UI and database table. Retain
  historical migrations and never reinterpret likes as saves.
- Show an eye icon and read-only project view total wherever a like control was
  rendered. Counts are public; no sign-in prompt or mutation is attached to them.
- Record project and image-detail visits through the existing interactions module.
  Both surfaces target the parent project. Card renders, prefetches, metadata
  generation and image changes within the same project are not additional views.
- Preserve authenticated-only writes, one accepted view per user/project/UTC day,
  event-key idempotency, organization-member exclusion and public-target checks.
  Guest recording remains a separate product decision; this change does not weaken
  the authenticated mutation guideline.
- Maintain `project_engagement.view_count` through an `AFTER INSERT` trigger on
  accepted project-view events. The increment shares the insert transaction,
  including for old API writers. Conflicting inserts do not fire the trigger.
- Lock event writers across migration backfill and trigger installation. Retained
  events seed totals; purging raw events does not decrement them. Project deletion
  cascades to its total. Historical views already purged or never recorded cannot
  be reconstructed.
- Expose bounded public view/save totals through `GET /api/interactions/projects`.
  Save counts are current `saved_project` rows. Never expose visitor identities or
  personalized saved state in this public response.

## Consequences

Existing designer and admin reports continue to read daily events. Their selected
date ranges differ from the public lifetime total. Reports group dates in India
time while uniqueness remains based on UTC days, preserving existing behavior.

The database trigger is maintained in the reviewed generated migration, since
Drizzle does not model triggers in its schema snapshot. Future event-write or
aggregate changes must account for it. Application code must not also increment
the total. Counter values are not a count of distinct lifetime people.

An unavailable count displays an em dash, never a fabricated zero. The client
batches visible counters in groups of at most 48 and refreshes after recording.
Tracking failure does not interrupt navigation, saving or sharing.

Removal is destructive for like rows. Release procedures must drain old API
instances before migration 0082; see the migration guide. No live deployment is
part of this implementation.
