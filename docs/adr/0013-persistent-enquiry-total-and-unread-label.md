# ADR 0013: Persistent enquiry total and unread label

Status: Accepted
Date: 2026-10-13
Supersedes: Display policy only in [ADR 0012](./0012-visitor-unread-enquiry-counter.md)
Superseded by: None

## Context

ADR 0012 made the home enquiry badge show unread enquiries and disappear when
everything was read. The requester clarified that the number should always remain
visible, like Saved, including when no messages or notifications are new.

## Decision

The home badge shows the total number of enquiries, including zero. It appends
`NEW` only when at least one enquiry has unread activity. Reading the latest
activity removes `NEW`, not the total. The visible number is not a message count
or an unread count; the live region announces total and unread counts separately.

Both values come from the existing private `GET /api/enquiries/counts` response.
Desktop and mobile use the same shared provider and badge. The existing terracotta
variant and control sizing are retained. The account-menu total stays unchanged.

## Consequences

ADR 0012's API, read watermarks, precision handling, refresh cadence, account
isolation and error recovery remain unchanged. Unknown or failed reads still show
Retry instead of inventing a zero. No backend change or migration is needed.
