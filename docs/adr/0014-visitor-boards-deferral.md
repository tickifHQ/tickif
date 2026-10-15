# ADR 0014: Visitor Boards deferred from the home revamp

Status: Accepted
Date: 2026-10-13
Supersedes: None
Superseded by: None

## Context

The visitor home design includes a
[Save to board picker](https://www.figma.com/design/WJhOguDptAwt2735BS2WMG/tickif--DS-?node-id=16123-66693).
It presents named boards, board search, recent boards with cover thumbnails and
home counts, saving to a selected board, shared-board information and board
creation. These are distinct from the existing account-scoped saved-project list.

On 2026-10-13, the requester explicitly deferred the whole Boards capability
because it is outside the current visitor home revamp scope. This is an accepted
scope decision, not a temporary backend blocker or authorization to implement
only the picker.

## Decision

- Defer the complete Boards feature from this revamp: the picker, board creation
  and management, listing/search and recent-board selection, board-specific saves,
  counts and cover summaries, and board sharing/collaboration.
- Retain the existing flat Saved projects flow. Card Save/Unsave actions continue
  to use the account-scoped saved-projects API; the Saved total and
  `/saved-projects` destination remain unchanged.
- Do not expose Boards navigation, Save to board controls or placeholder board
  data that imply this capability is available. The Figma section remains a
  future design reference, not a delivery requirement for this change.
- Do not add Boards contracts, APIs, schema or migrations as part of this revamp.
  This decision does not require deleting retained functionality or existing
  saved-project data.

Implementing the full Boards flow now would expand the explicitly agreed scope.
Implementing a static picker alone would imply board persistence and sharing
that the current save flow does not provide. Both alternatives are excluded.

## Consequences

The revamp intentionally differs from this Figma section. Visitors can still
save and remove projects, but cannot organize them into named boards or share
boards. Existing saves, counts, recommendations and account isolation are
preserved; no data migration or runtime behavior change follows from this record.

Boards requires a separately scoped and approved end-to-end task before it can
be introduced. That task must define board ownership and sharing permissions,
project membership and count semantics, treatment of existing flat saves, and
the associated API, UI and lifecycle tests. This decision commits to no delivery
date and does not permanently reject the feature.

## Amendments

None. A future decision that brings Boards into scope must supersede this record
and update the ADR index and affected documentation.
