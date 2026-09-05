# ADR 0001 — RBAC role model and company org/team

Status: Accepted
Date: 2026-06-09, amended 2026-08-27
Context: E-86 and E-240 (Epic 3 · RBAC & Access Control)

## Context

The platform needs a 4-role authorization model (visitor, designer, admin, superadmin)
and a company team structure (Corporate tier, multiple admins). better-auth gives us
an `admin` plugin (a role string on `user`) and an `organization` plugin (orgs with
their own member roles). We need to decide how these relate and how roles are stored,
without hand-rolling tables.

## Decision

1. **Two orthogonal role systems.**
   - **Platform role** lives on `user.role` and is global: `visitor | designer | admin
| superadmin`. It answers "what can this account do on the platform".
   - **Org role** lives on `member.role` (organization plugin: `owner | admin |
  billing_admin | member | viewer`) and is scoped to one company org. It answers
     "what can this account do inside this company".
     They compose independently: e.g. a platform-`designer` who creates their company is
     org-`owner` of that org. Neither derives from the other.

2. **`user.role` is a Postgres `pgEnum`** (`user_role`), default `visitor`, not null.
   Authorization is security-critical and the role set is closed, so we want
   database-level integrity, per `rules/database.md`. better-auth's CLI generates this
   column as plain `text`; the committed enum is a deliberate, documented "stricter than
   generated" refinement (same posture as `user.status` in E-80). The `admin` plugin is
   configured with `defaultRole: 'visitor'` so better-auth only ever writes values inside
   the enum.
   `member.role` deliberately stays plain `text` because the organization plugin owns
   that column. E-240 closes the org role set to five single-role values through static
   better-auth access-control definitions, request validation, and a database CHECK.
   Its migration collapses any legacy comma-joined values before adding the CHECK.

3. **`adminRoles` and the fine-grained permission framework are deferred to E-87.** We do
   NOT set `adminRoles` here: better-auth validates every `adminRoles` entry against the
   roles defined via `createAccessControl`, so naming `superadmin` before those role
   definitions exist throws at startup. E-86 establishes only the role _model_ + default;
   E-87 adds the `createAccessControl` statements, the `requireRole`/`requireOwnership`/
   org-membership guards, and at that point sets `adminRoles: ['admin', 'superadmin']`.

4. **Company = organization, team = its members.** We do NOT enable better-auth
   sub-`teams`: the Corporate "multi-admin" requirement is satisfied by multiple
   organization members, and nested teams are YAGNI for v0. Below Corporate the
   organization remains Owner-only and role assignment and invitations return a tier
   error. Corporate activates the fixed five-role capability matrix.

5. **Downgrades preserve memberships.** `member.frozen`, `frozen_at`, and `freeze_rank`
   hold resource-level freeze state. Frozen memberships remain stored but have no
   authorization capabilities and do not consume an active seat. Restore uses the
   target tier's capacity and proceeds in freeze-rank order.

## Consequences

- E-86 established the model + default; E-87 delivered the enforcement on top of it:
  the `createAccessControl` role definitions, `adminRoles`, and the Hono guards
  (`requireAuth` / `requireRole` / `requireAnyRole` / `requireOwnership`).
- `auth:generate` will report `user.role` as `text`; reviewers should expect that and
  not "fix" the committed enum back to text.
- Adding a future platform role means editing the `user_role` enum (a migration) and the
  `admin` plugin config together.
- Adding or changing an organization role means updating the shared contract,
  better-auth access-control map, database CHECK, migration, and the readable 5 × 12
  policy test together. Dynamic organization roles remain disabled.
- Installing the `admin` plugin mounts the `/admin/*` endpoints immediately. The four
  roles are defined via `createAccessControl`, and `adminRoles: ['admin', 'superadmin']`
  keeps both privileged roles recognized as protected impersonation targets. Only
  `superadmin` receives Better Auth user/session administration statements. A platform
  `admin` uses the app's Hono moderation routes and cannot call Better Auth
  account-management endpoints. Configured role names are validated by Better Auth,
  while the `user_role` enum remains the persistence backstop.
- E-87 guard semantics: `requireRole`/`requireAnyRole` are exact-match (no hierarchy —
  `admin` does not pass a designer-only gate); `superadmin` implicitly passes every
  role and ownership gate; `requireOwnership` grants owner OR org-member OR superadmin,
  and platform `admin` gets no implicit ownership pass (moderation routes declare
  `requireAnyRole(['admin'])` instead).
