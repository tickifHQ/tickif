# ADR 0004 — No-card early-bird trials

Status: Accepted
Date: 2026-10-09
Supersedes: None

## Context

The landing design includes an early-bird promotion. Product approved three months
on either paid plan, no card upfront, unlimited availability, through 31 December 2026. The existing Razorpay flow starts paid subscriptions and cannot represent a
no-card grant without collecting a payment mandate.

## Decision

- A new paid customer can claim one trial per organization. Hobby organizations
  with no provider subscription/history and no previous trial qualify. Existing
  paid customers and abandoned provider checkouts do not qualify.
- Claims close at 1 January 2027, 00:00 Asia/Kolkata, exclusive. Each claim grants
  three calendar months from activation, clamped at month end in that timezone.
- Trials are local subscription grants, with a persistent tier/start/end record.
  They never create a Razorpay subscription or schedule a charge. Repeated claims
  return the original trial; they never extend it or change its tier.
- Claim requires current organization billing capability. The organization billing
  and retention locks serialize claim, expiry, paid checkout and lifecycle work.
- At expiry, the organization returns to active Hobby. Excess seats and branches
  are frozen using the existing resource reconciliation, preserving their data.
  A later paid subscription requires fresh explicit checkout. Checkout is blocked
  while a trial is active to avoid charging before the promised end.
- The lifecycle worker expires trials. Entitlement reads also reconcile expiry,
  and authorization queries calculate an expired local trial as Hobby even if the
  worker is delayed. Search ranking already uses the coverage end timestamp.
- Public pricing uses the existing server-side Razorpay plan creation prices and
  shared entitlement rules. It does not expose provider IDs or organization data.
  Checkout continues to retrieve and confirm provider prices independently.

## Consequences

The public strip and cards advertise a real claimable offer without fabricated
availability counts. The promotion expires automatically, while already claimed
trials retain their full term. There is no automatic conversion or charge. Billing
shows trial dates and explains the return to Hobby. Migrations 0077–0078 add the
trial fields and their consistency constraint; deploy them before the API/worker release. Existing pricing and eligibility are not
changed for paying organizations.

One trial is enforced per organization, not per human across multiple organizations.
Deleting an organization deletes its subscription/trial history under the existing
retention policy; cross-organization promotion abuse controls are outside this scope.
