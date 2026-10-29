# ADR 0021 — Google One Tap snooze instead of a permanent dismissal flag

Status: Proposed
Date: 2026-10-29
Supersedes: None
Superseded by: None

## Context

The One Tap request asked that the prompt never show again after a visitor
dismisses it, using Google's own cooldown plus a local flag. Google Identity
Services now runs One Tap through FedCM. Under FedCM the prompt callback reports a
skipped moment with no reason, and it reports the same thing when the visitor
closes the prompt and when Google cannot show it at all (no Google session in the
browser, origin not authorized). A local run confirmed this: from an origin the OAuth
client does not list, Google answered the client metadata request with 403, the
prompt callback received a skipped moment, and the console showed
"FedCM get() rejects with NetworkError". See the
[FedCM migration guide](https://developers.google.com/identity/gsi/web/guides/fedcm-migration).

A permanent flag set on a skipped moment would therefore also switch One Tap off for
good for anyone whose first visit failed, such as a visitor who signed in to Google
later.

## Decision

Any skipped moment snoozes the prompt on that browser for 30 days in `localStorage`.
Google's cooldown still applies on top; its longest step is four weeks. The Better
Auth client is configured not to re-prompt, so one page view makes at most one
FedCM request. See [auth architecture](../architecture/auth.md#google-sign-in).

## Consequences

A visitor who closes the prompt does not see it again for 30 days in that browser.
A visitor whose prompt could not be shown waits the same 30 days. Clearing site data
resets the snooze. If Google adds a reliable close reason under FedCM, the snooze
can become a permanent flag for real dismissals only.

## Amendments

None.
