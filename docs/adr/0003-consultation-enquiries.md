# ADR 0003 — Consultation enquiries instead of scheduling

Status: Accepted
Date: Original decision date not recorded; confirmed by the product owner on 2026-10-02.

## Context

Consultation booking was deferred in favor of enquiries. Tickif captures the enquiry and delivers it to the professional's lead inbox. The homeowner and professional arrange any consultation through channels outside Tickif.

## Decision

Public actions should say **Enquire** or **Send enquiry** and use the existing enquiry eligibility and submission flow. Public copy should not promise in-app consultation scheduling. Booking functionality remains disabled and deferred; activating it, exposing scheduling UI, and validating its lifecycle are outside the current feedback implementation plan. Dormant booking code does not need to be removed.

## Consequences

This decision supersedes the older request for a **Book consultation** CTA in the [Tickif feedback](https://wakeful-heaven-467.notion.site/Tickif-feedback-3e0ffe32b69c80688ec7d63e957e449b).

Booking code and tests remain available for a future decision. Their presence does
not authorize enabling scheduling or presenting a public booking CTA.
