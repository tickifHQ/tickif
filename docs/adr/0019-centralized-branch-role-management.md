# ADR 0019 — Centralize role editing in Team & Roles

Status: Accepted; amended
Date: 2026-10-17
Supersedes: The inline role-editing portion of [ADR 0018](./0018-branch-member-management.md)
Superseded by: [ADR 0020](./0020-paginated-organization-management.md), for complete-list client pagination only

## Context

ADR 0018 placed organization-role selectors in branch member rows. Subsequent
user feedback explicitly requests read-only role badges and the text
"Change roles in team and roles" instead. Organization roles affect every branch,
so the requested destination is the existing studio-wide role management page.

## Decision

Show organization roles as shared Badge components on branch pages.
Remove their role selectors and role-update handler, and link the requested copy
to `/designer/terms-roles`. Team & Roles retains its existing role editing and
authorization rules. Direct branch assignment and removal remain available to
authorized managers. The original inline-editing alternative is replaced at the
user's explicit request; no permission or data-model changes are needed.

## Consequences

Role editing has one studio-wide UI entry point, while branch tables display
roles without implying branch-local permissions. Branch search, member search and
pagination operate on the complete accessible lists returned by the existing API.
Component and journey coverage verifies the role-management link and read-only
branch roles. Existing studio memberships and branch assignments are preserved.

## Amendment — 2026-10-18

[ADR 0020](./0020-paginated-organization-management.md) replaces the complete-list
client pagination mechanism with API search and pagination. Centralized role
editing and read-only branch role badges remain accepted.
