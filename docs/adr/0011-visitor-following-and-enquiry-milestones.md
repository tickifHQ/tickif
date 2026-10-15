# ADR 0011 — Visitor following and enquiry milestones

Status: Accepted
Date: 2026-10-12
Supersedes: None
Superseded by: [ADR 0012](./0012-visitor-unread-enquiry-counter.md), header counter policy only

## Context

Visitor home Figma nodes `16123:62343` and `16123:62361` require an enquiry
progress summary and a followed-studio row. Neither had backend event tracking.
The task now explicitly includes their backend implementation. The requester
clarified that Sent is the visitor's enquiry, Viewed is the studio opening it,
and Contacted is the studio sending a message to the visitor.

## Decision

- Persist private per-account follows and a monotonic last-portfolio-visit
  watermark. NEW counts are currently published projects newer than that
  watermark, not invented stories or lifetime upload totals. Pending edits,
  drafts, inactive studios and future publish dates are excluded.
- Only an actually mounted portfolio acknowledges updates, using the timestamp
  captured before its uncached payload read. GETs and prefetches never mark
  updates read. Old tabs cannot move either watermark backwards.
- Preserve Sent from the enquiry's creation. Record the first Viewed timestamp
  through an authorized POST from the mounted lead details. Lead status edits
  do not imply Viewed or messaging.
- Contacted means a successfully persisted studio reply. Messages and milestones
  commit together, and a caller-generated request UUID makes retries idempotent.
  Reusing that UUID with different text is a conflict. Closed/spam leads cannot
  receive new replies. Authorized read-only members cannot send replies.
- Replace the design's phone-call claim with truthful message copy. Phone calls
  are not tracked. Historical Responded statuses remain visible without invented
  Viewed/Contacted dates. The initial enquiry and studio replies are available
  to the requester; this does not add two-way live chat or SMS/email delivery.
- Authenticated requester acknowledgements clear NEW only through the activity
  they loaded. A later response remains unread. Counts in the header remain total
  enquiries, not unread counts.

Amendment, 2026-10-13: the header-total policy above is historical and has been
replaced by ADR 0012 following the request for a functioning `1 NEW` counter.
All following, milestone, message and read-watermark decisions remain current.

## Consequences

Apply additive migrations 0084 and 0085 before releasing API/web. Follow and
message foreign keys have explicit deletion policies and indexed read paths.
The new endpoints use the existing customer/organization guards and typed
contracts; private responses are not cached. Images are current public cover
derivatives, never unpublished media or originals.

The following rail refreshes its own account-scoped data when it becomes active,
on window focus and after follow changes. This handles cached Back navigation
without refreshing the project feed. Missing logos use existing initials; an
incomplete or disabled portfolio does not expose a broken link. Failed replies
keep their draft, and failed reads remain retryable.

Amendment, 2026-10-13: the Following tab and avatar rail share one account-scoped
list read. The tab's total counts followed active studios, not projects or unread
updates. Its private feed uses the authenticated actor's follows in a Postgres
EXISTS predicate, shared by card and facet queries. It reuses discovery card
assembly without making public discovery session-dependent. Search/filter
fallback cannot drop this predicate, and pagination uses a look-ahead row. The
feed excludes drafts, inactive studios and future publication dates. No new
schema or migration is required beyond the existing following tables.

After a successful requester read acknowledgement, an authenticated Next.js
Server Action invalidates only `/home`. This prevents cached Back navigation
from restoring a stale NEW enquiry badge. Ownership and the read watermark
remain enforced by the API; the action accepts no path or account identifiers.
