# ADR 0016 — Admin lead visibility and cohort reporting

Status: Accepted
Date: 2026-10-17

## Context

The existing admin workspace exposes enquiry summaries and moderation queues,
while full lead details and company analytics require organization membership.
The product owner explicitly requested platform-wide lead details and pipeline,
designer/company analytics with drill-down, and enquiry response/conversion
reporting with date and company filters. Consultation scheduling must remain disabled.

## Decision

- Add read-only platform-admin reporting under `/api/admin/insights` and admin
  pages `/admin/leads`, `/admin/leads/[id]` and `/admin/analytics`. Only freshly
  authorized platform admins and superadmins can read these endpoints. This
  explicitly extends existing admin enquiry visibility to contact numbers,
  original descriptions, assignment, internal notes and paginated studio messages
  across companies. Organization members retain their existing scoped APIs.
- Admin GETs do not update viewed, contacted or requester-read milestones. All
  new responses are private/no-store; there are no new mutations or exports.
- Use inclusive India calendar dates with an exclusive following-midnight bound,
  defaulting to the last 30 days. Require paired dates and limit each query to
  366 days, with bounded pagination and searchable paginated company selection.
- Report enquiry cohorts by submission date. Response means a recorded
  `contactedAt` studio-message milestone (ADR 0011), including later replies.
  Historical responded statuses without this milestone are not invented responses.
- Retain the existing analytics definition of pipeline conversion: the linked
  lead is currently contacted or closed. Label it as pipeline progression, never
  confirmed sales or revenue. Both rates divide by submitted enquiries, with
  zero rates for empty cohorts. Lead pipeline counts use received dates and
  current status; views and new projects use their own event/creation dates.
- Aggregate fact tables independently before joining company/designer counts.
  Include inactive and frozen branches for operator visibility. Drill-down and
  pagination preserve scope. No new data model or migration is required.

## Consequences

Admins can inspect private lead data without impersonation or company membership.
Access remains limited to the platform role boundary and never grants reply or
lead-edit capabilities. Reports describe current outcomes of a submission cohort,
not historical stage transitions or the day replies occurred. View metrics depend
on retained raw events. There is no reliable won/lost sale model or historical
stage-transition ledger to report sales or time-in-stage.

ADR 0003 remains unchanged: no consultation scheduling UI or booking activation.
Unit, API integration and frontend checks cover role boundaries, cohort dates,
counts, filters, drill-down and read-only milestone behavior.
