# ADR 0012: Visitor unread enquiry counter

Status: Accepted
Date: 2026-10-13
Supersedes: Header counter policy only in [ADR 0011](./0011-visitor-following-and-enquiry-milestones.md)
Superseded by: [ADR 0013](./0013-persistent-enquiry-total-and-unread-label.md), display policy only

## Context

ADR 0011 initially kept the visitor header counter as total enquiries. The
requester subsequently asked for the Figma `1 NEW` label to work correctly.
A lifetime total is not an unread count, and counting just the first page or
messages would produce incorrect notifications.

## Decision

The home header shows the number of enquiries with unread activity, once per
enquiry, using the same read watermark as its summary. It hides the badge when
zero are unread. Inbox and account-menu totals continue to mean all enquiries.
Sent, Viewed and studio messages remain the tracked activities from ADR 0011.

`GET /api/enquiries/counts` returns private, uncached `{total, unread}` from one
requester-scoped aggregate, independent of list pagination. No message bodies,
photos or signing operations are required. One shared provider serves desktop
and mobile. It refreshes on activation, focus, visibility and every 30 seconds
in visible tabs, with abortable reads and no full-feed refresh. Hidden tabs do
not poll. Count reads have a 10-second deadline. Failure means an unknown count
with Retry, never a fabricated zero or a permanently stalled badge.

## Consequences

Existing read acknowledgements still clear only loaded activity. A newer reply
remains unread. Multiple messages to one enquiry produce one NEW item, not a
message count. No database migration or WebSocket service is required. The
30-second interval is bounded HTTP refresh, not instantaneous push delivery.
The rest of ADR 0011 remains accepted and unchanged.

## Precision correction, 2026-10-13

PostgreSQL activity timestamps retain microseconds, while JavaScript Date and
the original read payload reduced them to milliseconds. This left a successfully
opened enquiry unread in the aggregate, even when the rounded list said it was
read. Activity and thread responses now carry an optional opaque `readThrough`
UTC timestamp at full database precision. Reads preserve that string through to
SQL; list flags and aggregate counts use the same exact comparison. Studio reply
milestones retain the persisted message precision as well. A reply one microsecond
newer than the loaded watermark stays unread, including within the same millisecond.
Old timestamps remain accepted and watermarks remain monotonic and clamped to
server time. No migration, forced read-state reset or count-only rounding is used.
The mounted message thread acknowledges after rendering in a visible tab; hidden
tabs defer the read until visible. The existing authenticated cache invalidation
continues to refresh the home count on return without reloading the document.

## Display policy replaced, 2026-10-13

The requester subsequently clarified that the total must remain visible even
with no unread activity. ADR 0013 replaces only the badge display decision above;
this record's API, refresh, read acknowledgement and precision decisions remain
accepted.
