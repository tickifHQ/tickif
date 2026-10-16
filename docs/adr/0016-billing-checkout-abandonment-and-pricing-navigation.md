# ADR 0016 — Billing checkout abandonment and pricing navigation

Status: Accepted
Date: 2026-10-17
Supersedes: None

## Context

PR #640 deliberately retained browsing selection and required an unfinished
checkout to be continued before choosing another plan. PR #709 retained checkout
resumption and moved plan comparison to its own page, but several billing actions
still opened the older pricing dialog. Tests asserted both behaviors.

Product confirmed that leaving an unused checkout must restore Buy/Upgrade
options and that all pricing entry points must use the plans subpage. This changes
the earlier checkout-resumption policy while completing the existing navigation
decision. Payment authorization, captured funds and uncertain provider outcomes
still require reconciliation.

## Decision

- Keep browsing selection in component memory. Remove legacy persisted intent;
  an explicit tier in a navigation URL may initialize the plans page without
  authorizing a purchase.
- Route plan selection from billing to `/designer/plan-billing/subscribe`.
  Render the pricing comparison on that page. Selecting a plan opens its
  subscription confirmation dialog; closing it clears the selection and returns
  to the comparison. The pricing table never renders inside the dialog.
  Razorpay's own secure payment interface remains the provider boundary.
- An unused provider checkout in `created` state does not reserve the available
  plans. A fresh explicit purchase may reuse its matching checkout or supersede
  it when a different plan is chosen, after server-side validation.
- Retain superseded provider IDs durably so late authorization, payments and
  webhooks can be reconciled and compensated without changing the current plan.
  Do not simply discard a provider ID or infer payment failure from navigation.
- Preserve safeguards for authorized mandates, captured payments and unknown
  outcomes. Entitlements remain provider-authoritative; closing a browser UI is
  never evidence that money cannot arrive.

## Consequences

Customers can return to available plans after leaving an unused checkout, and
all plan-selection paths share the same subpage. Compensation records and worker
reconciliation add operational state; unresolved records must survive organization
retention until their provider agreements and payments are settled.

The additive database migration must precede API/worker rollout. Local automated
provider fixtures verify application behavior; merchant sandbox settlement and
real provider configuration remain separate deployment checks.
