# Architectural decision records

Read this index at the start of every job, then the records relevant to the task.
Follow amendment and supersession notes to identify the current decision. The
[architecture](../architecture/README.md) describes current implementation;
these records preserve decision context and consequences.

| ADR                                                                          | Status            | Date                                        | Topic and applicability                                                  |
| ---------------------------------------------------------------------------- | ----------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| [0006 — Feedback identity and logo fallbacks](./0006-feedback-card-identity-and-logo-fallbacks.md) | Accepted | 2026-10-10 | Current feedback takes precedence over sample card text; identifiable apartment logos with initials fallback |
| [0005 — Tickif image signatures](./0005-tickif-image-signatures.md)          | Accepted          | Original date unknown; confirmed 2026-10-09 | Tickif signature replaces the planned SynthID integration                |
| [0004 — No-card early-bird trials](./0004-early-bird-trials.md)              | Accepted          | 2026-10-09                                  | Campaign deadline, claim eligibility, expiry and payment consent         |
| [0001 — RBAC role and organization model](./0001-rbac-role-and-org-model.md) | Accepted; amended | 2026-06-09; amended 2026-08-27              | Platform/org roles, membership, permissions and downgrade behavior       |
| [0002 — Media pipeline](./0002-media-pipeline.md)                            | Accepted          | 2026-06-14                                  | Direct upload, asynchronous derivation, idempotency and failure handling |
| [0003 — Consultation enquiries](./0003-consultation-enquiries.md)            | Accepted          | Original date unknown; confirmed 2026-10-02 | Enquiry CTAs and deferred consultation scheduling                        |

No record is currently marked superseded. ADR 0003 supersedes the older booking
CTA request linked in that record; it does not remove the retained booking code.
ADR 0001 distinguishes its original enforcement deferral from subsequent delivery.
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
