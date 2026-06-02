# API (Hono + @hono/zod-openapi)

Scope: `apps/api/**`. Reference module: `apps/api/src/modules/projects/`.

- **Layering:** `routes.ts` is the only file importing Hono → `service.ts` (no
  Hono, no Drizzle) → `repository.ts` (only Drizzle). No business logic in routes.
- Define routes with `createRoute` + `app.openapi(...)`. The same Zod schemas
  power validation **and** the OpenAPI spec — never maintain a separate spec.
- **Guard routes via the route's `middleware` field**, e.g.
  `middleware: [requireAuth] as const`. **Do not** chain `.use(path, mw)` between
  `.openapi()` calls — it downgrades `OpenAPIHono` to `Hono` and breaks `.openapi`
  typing and `AppType`.
- Validate input with `c.req.valid('json' | 'query' | 'param')`. Don't read raw
  unvalidated input.
- Throw `AppError` (`apps/api/src/lib/errors.ts`) for domain failures; the central
  `onError` maps them to the envelope `{ error: { code, message, details } }`.
  Don't scatter `c.json({...}, 4xx)`.
- Mount every module into the exported `app` chain in `src/app.ts` so it lands in
  `AppType` (the web `hc` client) and `/docs`.

## Don't

- ❌ Import `@repo/db`/Drizzle in a service or route.
- ❌ `.use()` mid-`.openapi()`-chain to add auth — use the route `middleware` field.
- ❌ Inline a request/response shape instead of importing from `@repo/contracts`.
- ❌ Hand-roll error responses instead of throwing `AppError`.

See also: [validation.md](./validation.md), [auth.md](./auth.md), [database.md](./database.md), [testing.md](./testing.md).
