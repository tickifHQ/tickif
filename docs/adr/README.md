# Architectural decision records

Read this index at the start of every job, then the records relevant to the task.
Follow amendment and supersession notes to identify the current decision. The
[architecture](../architecture/README.md) describes current implementation;
these records preserve decision context and consequences.

| ADR                                                                                                                        | Status            | Date                                        | Topic and applicability                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [0016: Billing checkout abandonment and pricing navigation](./0016-billing-checkout-abandonment-and-pricing-navigation.md) | Accepted          | 2026-10-17                                  | Restore plan choices after unused checkout; route pricing entry points to the plans subpage; reconcile superseded attempts |
| [0015 — City-level nearby discovery](./0015-nearby-city-discovery.md)                                                      | Proposed          | 2026-10-16                                  | Explicit device permission, transient Google city lookup, and city-scoped saved-location suggestions                       |
| [0014: Visitor Boards deferred](./0014-visitor-boards-deferral.md)                                                         | Accepted          | 2026-10-13                                  | Boards excluded from the visitor home revamp; existing flat saved-project behavior retained                                |
| [0013: Persistent enquiry total and unread label](./0013-persistent-enquiry-total-and-unread-label.md)                     | Accepted          | 2026-10-13                                  | Always-visible home enquiry total, with NEW only for unread activity                                                       |
| [0012: Visitor unread enquiry counter](./0012-visitor-unread-enquiry-counter.md)                                           | Accepted; amended | 2026-10-13                                  | Private aggregate API, visible-tab refresh and recoverable errors; display policy replaced by ADR 0013                     |
| [0011 — Visitor following and enquiry milestones](./0011-visitor-following-and-enquiry-milestones.md)                      | Accepted          | 2026-10-12                                  | Account-scoped follows, published-project updates, actual viewed and studio-message milestones                             |
| [0009 — AVIF encoding effort](./0009-media-encoding-effort.md)                                                             | Proposed          | 2026-10-11                                  | Explicit CPU effort 2 at the existing quality, sizes and signature policy; staging latency verification pending            |
| [0010 — Saved custom location classification](./0010-saved-custom-location-classification.md)                              | Accepted          | 2026-10-11                                  | Derived location backfill preserves live/pending boundaries and authored content                                           |
| [0008 — Homepage feedback copy](./0008-homepage-feedback-copy.md)                                                          | Accepted          | 2026-10-11                                  | Original feedback headline and category line override the newer Figma wording                                              |
| [0006 — Feedback identity and logo fallbacks](./0006-feedback-card-identity-and-logo-fallbacks.md)                         | Accepted          | 2026-10-10                                  | Current feedback takes precedence over sample card text; identifiable apartment logos with initials fallback               |
| [0005 — Tickif image signatures](./0005-tickif-image-signatures.md)                                                        | Accepted          | Original date unknown; confirmed 2026-10-09 | Tickif signature replaces the planned SynthID integration                                                                  |
| [0004 — No-card early-bird trials](./0004-early-bird-trials.md)                                                            | Accepted          | 2026-10-09                                  | Campaign deadline, claim eligibility, expiry and payment consent                                                           |
| [0007 — Project views replace likes](./0007-project-views-replace-likes.md)                                                | Accepted          | 2026-10-10                                  | View totals, daily recording, saved projects and removal of likes                                                          |
| [0001 — RBAC role and organization model](./0001-rbac-role-and-org-model.md)                                               | Accepted; amended | 2026-06-09; amended 2026-08-27              | Platform/org roles, membership, permissions and downgrade behavior                                                         |
| [0002 — Media pipeline](./0002-media-pipeline.md)                                                                          | Accepted          | 2026-06-14                                  | Direct upload, asynchronous derivation, idempotency and failure handling                                                   |
| [0003 — Consultation enquiries](./0003-consultation-enquiries.md)                                                          | Accepted          | Original date unknown; confirmed 2026-10-02 | Enquiry CTAs and deferred consultation scheduling                                                                          |

No record is currently marked superseded. ADR 0003 supersedes the older booking
CTA request linked in that record; it does not remove the retained booking code.
ADR 0001 distinguishes its original enforcement deferral from subsequent delivery.
ADR 0012 replaces only ADR 0011's header-total policy; its other decisions remain accepted.
ADR 0013 replaces only ADR 0012's badge display policy, retaining the total and
using the unread aggregate to control the NEW label.
ADR 0002 distinguishes its original owner-only boundary from current organization
capability checks. Both clarifications were recorded on 2026-10-06.
For later media settings and regeneration, also read
[media architecture](../architecture/media-pipeline.md) and its
[runbook](../runbooks/media-pipeline.md).

## Recording decisions

Create an ADR whenever implementation takes a major deviation from an agreed
plan, feedback requirement or existing decision. Major deviations include
replacing an integration or mechanism, changing a public product promise,
altering security/data boundaries, or deferring/removing an agreed capability.
Record the original plan, the chosen alternative, the reason and evidence,
consequences, and remaining verification or rollout work. Reference the ADR in
the implementing PR and update this index and affected documentation in the same
change. Use `Proposed` when the product decision is not yet accepted; do not
silently treat a deviation as approved. Routine implementation details do not
need a new ADR.

Copy [the template](./template.md) to the next available `NNNN-short-topic.md`.
Use `Proposed`, `Accepted`, `Deprecated` or `Superseded` as the status. Record the
actual decision date; state when it is unknown rather than inventing one.

Preserve context and consequences. Date amendments and distinguish the original
decision from later implementation. When replacing a decision, add a new ADR,
link the previous record under `Supersedes`, and mark the previous record
`Superseded` with a reciprocal `Superseded by` link. Update this index and affected
architecture/guidelines in the same change.
