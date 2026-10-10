# ADR 0008 — Restore the original homepage positioning

Status: Accepted
Date: 2026-10-11
Supersedes: None (replaces the headline copy from the newer Figma landing design)
Superseded by: None

## Context

Feedback item 38 requested “Inspire from real homes you’ll love.” and the category
line “Architecture · Construction · Interior.” The later landing refresh in
PR #715 instead displayed “Real Indian homes, and what they cost.” while the
original headline remained in metadata. During staging verification the product
owner explicitly selected: “Restore ‘Inspire from real homes you’ll love.’
(original tracker)”.

## Decision

Restore the original tracker headline and category line in the visible homepage
hero. This explicit product decision takes precedence over the newer Figma copy.
Retain the refreshed composition, decorative photography, search controls and
API-backed project/designer totals. Update existing wording assertions to the
accepted text. See [landing architecture](../architecture/landing-page.md).

## Consequences

The homepage communicates the accepted positioning consistently with its existing
metadata. Its visible wording deliberately differs from the newer Figma frame.
Deployment and desktop/mobile rendered verification remain separate acceptance
steps; this record does not claim visual approval or a completed staging rollout.

## Amendments

None.
