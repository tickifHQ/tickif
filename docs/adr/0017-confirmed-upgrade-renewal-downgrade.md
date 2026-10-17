# ADR 0017 — Downgrade a confirmed upgrade's future renewal

Status: Accepted
Date: 2026-10-17
Supersedes: None; extends [ADR 0016](./0016-billing-checkout-abandonment-and-pricing-navigation.md)

## Context

A captured Professional+ → Corporate adjustment grants Corporate access immediately,
while the Corporate mandate remains authenticated until the existing paid boundary.
The confirmed replacement record must survive until renewal for reconciliation and
compensation. Treating its existence as unfinished checkout prevented a subsequent
Professional+ downgrade and incorrectly instructed customers to resume checkout.

## Decision

Retain the confirmed paid upgrade and explicitly authorize a successor Professional+
mandate starting at the same boundary. A nullable predecessor reference keeps both
provider identities and the original adjustment payment. Permit one pending replacement
and one confirmed replacement per organization; reserve successors under the existing
organization lock and durable operation. Other overlapping replacements remain rejected.

Before authorization, the predecessor still owns the renewal and paid access. Expiry
or dismissal of an unused successor must not cancel that renewal. After authorization,
cancel and verify termination of the authenticated future Corporate mandate, then
atomically retire the predecessor and confirm the successor. Unknown cancellation
outcomes remain pending and reconcile without another checkout. If renewal has already
started, preserve that paid cycle and require a fresh review rather than cancelling it
immediately. Existing provider-event and refund reconciliation retains historical rows.

Corporate remains active until the verified boundary. Thereafter Professional+ follows
the existing paid-renewal/grace policy; mandate authorization alone never proves a paid
renewal. Existing Hobby cancellation remains available. Confirmed plans awaiting renewal
use renewal-specific copy instead of a checkout-resumption instruction.

## Consequences

Migration 0088 must precede API and worker rollout. Existing rows need no backfill.
API and worker must run the same successor-aware lifecycle version. Regression tests
cover confirmed-upgrade selection, zero adjustment, unused successor expiry, cancellation
uncertainty, replay, paid access preservation and the boundary during provider outage.
Do not clear a confirmed record or edit staging financial state to unblock a downgrade.
