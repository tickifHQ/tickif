# Auth (better-auth)

Scope: `packages/auth/**`, auth middleware, and protected routes.

- Configure once in `packages/auth/src/index.ts`. `BETTER_AUTH_SECRET` (32+ bytes,
  `openssl rand -base64 32`) and `BETTER_AUTH_URL` come from env — never hardcode.
- After **adding/changing plugins**, regenerate the auth schema
  (`pnpm --filter @repo/auth generate`, which runs `npx @better-auth/cli@latest`),
  reconcile `packages/db/src/schema/auth.ts`, then `db:generate && db:migrate`.
- Use type inference: `typeof auth.$Infer.Session`. Read the user via
  `c.get('user')` after the `withSession` middleware.
- Protect routes via the route `middleware: [requireAuth]` field (see [api.md](./api.md)).
- Production hardening: `useSecureCookies: true`, set `trustedOrigins` (and
  **remove** the localhost origin), keep CSRF/origin checks **on**, and move
  sessions + rate limiting to Redis via `secondaryStorage`.
- Prefer importing plugins from dedicated subpaths for tree-shaking
  (`better-auth/plugins/<name>`).
- The 4-role RBAC (superadmin/admin/designer/visitor) is layered via better-auth
  access-control; role names passed to `adminRoles` MUST be defined in `roles`, or
  startup throws. Keep them in sync.

## Don't

- ❌ Hardcode the secret/base URL.
- ❌ Disable CSRF/origin checks or rate limiting in production.
- ❌ Add a plugin without regenerating + migrating the auth schema.
