# Authentication & Authorization

Auth is handled by **better-auth**, configured once in `packages/auth/src/index.ts`
and mounted into the API. We do not hand-roll sessions, OTP, or OAuth.

## What's enabled

| Capability | Plugin / provider | Notes |
| --- | --- | --- |
| Phone OTP (primary, India) | `phoneNumber` plugin | OTP is the main login path. |
| Gmail SSO | `google` social provider | For designers; only active if `GOOGLE_CLIENT_ID/SECRET` are set. |
| Role-based access | `admin` plugin | Defaults today (`admin` + `user`); see RBAC below. |
| Orgs / membership | `organization` plugin | Tables provisioned; wire up as needed. |
| Email + password | — | Disabled (`emailAndPassword.enabled: false`). |

## How it's wired into the API

In `apps/api/src/app.ts`, better-auth owns everything under `/api/auth/*`:

```ts
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
```

A session-resolving middleware (`apps/api/src/lib/auth-middleware.ts`) runs on
every request and attaches `user` / `session` to the Hono context:

```ts
app.use('*', withSession);   // sets c.get('user') / c.get('session')
```

## Protecting a route

Use the `requireAuth` middleware via the route definition's `middleware` field:

```ts
const createRoute = createRoute({
  method: 'post',
  path: '/',
  middleware: [requireAuth] as const,     // ← guard here
  security: [{ cookieAuth: [] }],          // ← documents it in OpenAPI
  // ...
});
```

`requireAuth` throws `AppError.unauthorized()` (→ 401) when there's no user.
Inside a handler you can read the caller with `c.get('user')`.

> Do **not** guard routes with a chained `.use(path, requireAuth)` between
> `.openapi()` calls — it breaks the OpenAPIHono type chain. See
> [adding-a-module.md](./adding-a-module.md) and [troubleshooting.md](./troubleshooting.md).

## The phone-OTP flow (and how to test it)

The dev `sendOTP` hook in `packages/auth/src/index.ts` **logs the code to the
console** instead of sending an SMS (production wires this to MSG91). So to test
end-to-end locally:

```bash
PHONE="+919812345678"

# 1. Request an OTP — the code is printed in the API log
curl -s -X POST http://localhost:3001/api/auth/phone-number/send-otp \
  -H 'content-type: application/json' -d "{\"phoneNumber\":\"$PHONE\"}"

# 2. Find the code in the running `pnpm dev` output: "[auth] OTP for +91...: 123456"

# 3. Verify — creates the user + session, returns a session token/cookie
curl -s -X POST http://localhost:3001/api/auth/phone-number/verify \
  -H 'content-type: application/json' -d "{\"phoneNumber\":\"$PHONE\",\"code\":\"123456\"}"
```

On verify, better-auth creates rows in `user` and `session` (and consumes the
`verification` row). On first sign-up it derives a placeholder email
(`<phone>@phone.homefolio.local`) until the designer completes their profile —
configured via `signUpOnVerification` in the plugin options.

## better-auth tables & the schema

better-auth's tables (`user`, `session`, `account`, `verification`,
`organization`, `member`, `invitation`) are defined in
`packages/db/src/schema/auth.ts` and migrate **together with** the domain tables
(one migration set — see [database-and-migrations.md](./database-and-migrations.md)).

Two things to know:

- **Property keys must match better-auth's field names** (camelCase), because the
  Drizzle adapter discovers tables/fields by those names. The `casing: 'snake_case'`
  option maps them to snake_case columns.
- The canonical source for this schema is better-auth's own generator. If you
  change auth **plugins**, regenerate and reconcile `auth.ts`:
  ```bash
  pnpm --filter @repo/auth generate   # runs `npx @better-auth/cli generate`
  ```
  Review the output against `schema/auth.ts`, port any new columns, then
  `pnpm db:generate && pnpm db:migrate`. (We invoke the CLI via `npx` on purpose —
  installing it as a dependency caused a version conflict; see
  [troubleshooting.md](./troubleshooting.md).)

## RBAC — current state and the plan

The product needs four roles: **superadmin, admin, designer, visitor**. Today the
`admin()` plugin runs with its defaults (`admin` + `user` roles), which is enough
to boot and gate admin endpoints. The `user.role` column already exists to store
a role per user.

The full four-role model is layered on via better-auth's access-control
(`createAccessControl`) — defining role statements and permissions — in a later
phase. When you implement it, define the roles in the `admin` plugin's `roles`
config and pass them to `adminRoles`; passing role names that aren't defined
throws at startup (we hit this — keep them in sync).

## Client side (web)

The web app authenticates against `/api/auth/*` using better-auth's client (or
direct calls during early development). Authenticated API calls rely on the
session cookie; the `hc<AppType>` client forwards credentials when configured to.
Keep auth calls separate from the typed `hc` data client.
