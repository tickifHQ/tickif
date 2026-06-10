# ADR 0001 — RBAC role model and company org/team

Status: Accepted
Date: 2026-06-09
Context: E-86 (Epic 3 · RBAC & Access Control)

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
   - **Org role** lives on `member.role` (organization plugin: `owner | admin | member`)
     and is scoped to one company org. It answers "what can this account do inside this
     company".
   They compose independently: e.g. a platform-`designer` who creates their company is
   org-`owner` of that org. Neither derives from the other.

2. **`user.role` is a Postgres `pgEnum`** (`user_role`), default `visitor`, not null.
   Authorization is security-critical and the role set is closed, so we want
   database-level integrity, per `rules/database.md`. better-auth's CLI generates this
   column as plain `text`; the committed enum is a deliberate, documented "stricter than
   generated" refinement (same posture as `user.status` in E-80). The `admin` plugin is
   configured with `defaultRole: 'visitor'` so better-auth only ever writes values inside
   the enum.
   The same security argument applies to `member.role`, but it deliberately stays plain
   `text`: the organization plugin owns that column, supports custom org roles, and
   comma-joins multi-role arrays into the single string — a DB enum would fight the
   plugin's storage format. Org-role integrity is instead enforced at the application
   layer by the E-87 access-control guards.

3. **`adminRoles` and the fine-grained permission framework are deferred to E-87.** We do
   NOT set `adminRoles` here: better-auth validates every `adminRoles` entry against the
   roles defined via `createAccessControl`, so naming `superadmin` before those role
   definitions exist throws at startup. E-86 establishes only the role *model* + default;
   E-87 adds the `createAccessControl` statements, the `requireRole`/`requireOwnership`/
   org-membership guards, and at that point sets `adminRoles: ['admin', 'superadmin']`.

4. **Company = organization, team = its members**, using the organization plugin as-is
   (default `owner`/`admin`/`member`). We do NOT enable better-auth sub-`teams`: the
   Corporate "multi-admin" requirement is satisfied by multiple `admin` members, and
   nested teams are YAGNI for v0. An individual designer is either orgless or a
   single-member org.

## Consequences

- The fine-grained permission matrix (`createAccessControl` statements) and the guards
  that enforce these roles are E-87, not this ticket. E-86 only establishes the model +
  default.
- `auth:generate` will report `user.role` as `text`; reviewers should expect that and
  not "fix" the committed enum back to text.
- Adding a future platform role means editing the `user_role` enum (a migration) and the
  `admin` plugin config together.
- Installing the `admin` plugin mounts the `/admin/*` endpoints immediately, with
  `adminRoles` defaulting to `['admin']`. Two interim behaviors hold until E-87 sets
  `adminRoles`: a `superadmin` does not pass admin checks, and `set-role` performs no
  role-value validation upstream (it even comma-joins array input) — the `user_role`
  enum is the only write backstop, pinned by `set-role.integration.test.ts` (an
  out-of-enum value surfaces as a DB error, not a 400; E-87 should add proper request
  validation). Exposure in this window is limited: no account becomes `admin` without
  a deliberate manual DB promotion.
