# Homefolio — AI Agent Rules

Project-level rules for AI coding agents (Claude Code, Cursor, Copilot). These are
**enforced conventions**, not suggestions. They are grounded in the official
best-practice guidance for this stack (sources at the bottom). When a rule here
conflicts with a generic habit, this file wins.

Read [`docs/`](./docs/README.md) for the full explanations; this file is the
condensed, must-follow ruleset.

---

## 0. Golden rules (non-negotiable)

1. **Respect the layering.** In every API module: `routes.ts` (only Hono) →
   `service.ts` (no Hono, no Drizzle) → `repository.ts` (only Drizzle). Never
   import Drizzle or `@repo/db` outside a repository. Never put business logic in
   a route.
2. **Contracts are the single source of truth.** All request/response shapes are
   Zod schemas in `@repo/contracts`. Never inline-define a shape in a route or
   re-declare it in the web app — import it.
3. **Never read `process.env` directly.** Add the var to the Zod schema in
   `packages/config/src/index.ts` + `.env.example`, then import typed `config`
   from `@repo/config`.
4. **pnpm only.** Never run `npm`/`yarn`. Versions come from the catalog in
   `pnpm-workspace.yaml` (`"catalog:"`), not inline pins.
5. **Migrations are generated, reviewed, and committed.** Use
   `pnpm db:generate` → review SQL → `pnpm db:migrate`. **Never** `db:push` to a
   shared/prod DB. Commit the migration with its schema change.
6. **Type-safe end to end.** No `any`. No `@ts-ignore` without a comment. The web
   app calls the API via `hc<AppType>` — keep new routes in the `routes` chain in
   `app.ts` so they appear in `AppType`.
7. **Verify before claiming done.** Run `pnpm typecheck && pnpm lint` (and the
   relevant app) before declaring a task complete.

---

## 1. Commands

```bash
pnpm install                 # install (pnpm workspace)
pnpm dev                     # run api(:3001) + web(:3000) + worker
pnpm build                   # build all (api/worker → tsup dist, web → .next)
pnpm typecheck               # tsc --noEmit across workspace
pnpm lint                    # eslint across workspace
pnpm db:generate|migrate|studio
pnpm infra:up|down           # Postgres + Redis via docker compose
pnpm --filter @repo/<x> <script>   # target one package/app
```

Run a single app to isolate output: `pnpm --filter @repo/api dev`.

---

## 2. TypeScript

- Strict mode is on (`noUncheckedIndexedAccess` included). Honor it; don't widen
  types to silence errors.
- Use `import type { ... }` for type-only imports (lint enforces).
- Extend the right base config: `@repo/tsconfig/node.json` (Node) or
  `/nextjs.json` (web). Don't write tsconfig compiler options ad hoc.
- Prefer inference from Drizzle (`typeof table.$inferSelect`) and Zod
  (`z.infer<>`) over hand-written duplicate types.

## 3. API (Hono + @hono/zod-openapi)

- Define routes with `createRoute` + `app.openapi(...)`. The same Zod schemas
  power validation **and** the OpenAPI spec — never maintain a separate spec.
- **Guard routes via the route's `middleware` field**, e.g.
  `middleware: [requireAuth] as const`. **Do not** chain `.use(path, mw)` between
  `.openapi()` calls — it downgrades `OpenAPIHono` to `Hono` and breaks `.openapi`
  typing and `AppType`.
- Validate input with `c.req.valid('json' | 'query' | 'param')`. Don't read raw
  unvalidated input.
- Throw `AppError` (`apps/api/src/lib/errors.ts`) for domain failures; the central
  `onError` maps them to the standard envelope `{ error: { code, message, details } }`.
  Don't scatter `c.json({...}, 4xx)`.
- Mount every module in the `routes` chain in `app.ts` so it lands in `AppType`
  and `/docs`.

## 4. Validation (Zod v4 + @repo/contracts)

- **Define schemas at module level**, never inside a function (2–5× faster on
  repeated validation).
- Use **`safeParse`** in application code (structured errors, faster on invalid
  input); reserve `parse` for places where throwing is intended.
- `@repo/contracts` stays **framework-free** (plain `zod` only) so the web app can
  import it without server code.
- Tag every exported schema with `.meta({ id: 'Name' })` for clean OpenAPI
  component names.
- Use `z.coerce.*` for query/param inputs (everything arrives as strings).
- Use `z.discriminatedUnion('type', [...])` for tagged unions (O(1) dispatch).

## 5. Database (Drizzle + PostgreSQL)

- **Only repositories import `@repo/db`.**
- Organize schema by domain under `packages/db/src/schema/`, re-export via the
  barrel (`schema/index.ts`). Keep auth + domain in the **one** migration set.
- Property keys are camelCase; columns are snake_case via the global
  `casing: 'snake_case'`. Don't change the casing option (it's load-bearing for
  better-auth field mapping).
- **Index every foreign key.** Add composite indexes most-selective-first; use
  partial indexes (`.where(...)`) for status-filtered hot paths.
- Type JSONB columns with `.$type<T>()`. Use `pgEnum` for closed sets.
- Set `onDelete` cascade/set-null deliberately on FKs.
- `select` only the columns you need on hot paths; consider `.prepare()` for
  repeated queries.
- Migrations: **`generate` for anything shared/prod; `push` only for throwaway
  local prototyping.** Additive-first; for renames/structural changes use
  expand→backfill→contract.
- New high-volume tables: prefer bigint identity or UUIDv7 PKs over random UUIDv4
  (UUIDv4 PKs index poorly). Existing `uuid().defaultRandom()` PKs are fine at
  current scale — don't churn them without reason.

## 6. Auth (better-auth)

- Configure once in `packages/auth/src/index.ts`. `BETTER_AUTH_SECRET` (32+ bytes,
  `openssl rand -base64 32`) and `BETTER_AUTH_URL` come from env — never hardcode.
- After **adding/changing plugins**, regenerate the auth schema
  (`pnpm --filter @repo/auth generate`, which runs `npx @better-auth/cli@latest`),
  reconcile `packages/db/src/schema/auth.ts`, then `db:generate && db:migrate`.
- Use type inference: `typeof auth.$Infer.Session`. Read the user via
  `c.get('user')` after `withSession`.
- Production hardening (when configuring prod): `useSecureCookies: true`, set
  `trustedOrigins` (and **remove** the localhost origin), keep CSRF/origin checks
  **on**, and move sessions + rate limiting to Redis via `secondaryStorage`.
- Prefer importing plugins from dedicated subpaths for tree-shaking
  (`better-auth/plugins/<name>`).
- The 4-role RBAC (superadmin/admin/designer/visitor) is layered via better-auth
  access-control; role names passed to `adminRoles` MUST be defined in `roles`, or
  startup throws. Keep them in sync.

## 7. Background jobs (BullMQ worker)

- **Make jobs idempotent** — assume at-least-once delivery; key off a stable
  `jobId` or guard on existing state. BullMQ does not dedupe for you.
- Configure **retries with exponential backoff** and `removeOnComplete` /
  `removeOnFail` (bounded) to cap Redis growth.
- Set explicit concurrency (start ~`floor(cpuCount/2)`, then measure).
- **Pass connection *options*, not a shared ioredis instance**
  (`apps/worker/src/connection.ts`) — avoids the ioredis dual-version type clash.
- Keep payloads small: enqueue **IDs / storage keys**, not blobs; the worker
  re-fetches.
- Always handle SIGINT/SIGTERM with `worker.close()` for graceful shutdown.

## 8. Frontend (Next.js 16 + Tailwind v4)

- Default to **Server Components**; fetch data on the server. Add `'use client'`
  only at the leaves that truly need interactivity, and pass server data down as
  props.
- `params` and `searchParams` are **Promises** in Next 16 — `await` them.
- Prefer static rendering; use `export const dynamic = 'force-dynamic'` only when
  the page genuinely needs per-request freshness.
- Wrap slow data in `<Suspense>` for streaming. Use `React.cache` to dedupe
  identical fetches within a render.
- Call the API through the typed `hc` client (`apps/web/src/lib/api.ts`), not
  hand-written `fetch` with stringly-typed URLs.

## 9. Monorepo (Turborepo + pnpm)

- Root `package.json` is `private`, pins `packageManager`, and delegates scripts
  to `turbo run`. Don't add app logic to root scripts.
- Internal packages are `@repo/*`, referenced `"workspace:*"`, and export via
  their `exports` map. Don't deep-import a package's internal files.
- Bump shared deps in the **catalog** once. Add a catalog entry when 2+ packages
  share a dep. Watch for duplicate versions (`pnpm why <pkg> -r`) — duplicates
  cause real type/runtime bugs.
- api/worker build with **tsup** (inline `@repo/*`, keep npm deps external).
  Runtime deps used transitively must be **direct deps** of the app so they
  resolve under pnpm's isolated layout.

## 10. Security (always)

- Validate **all** external input through `@repo/contracts` schemas.
- Secrets only in env / secrets manager; `.env` is gitignored. Never log secrets,
  tokens, or OTP codes in production (the dev OTP console log is dev-only).
- Gate high-intent + mutating endpoints with `requireAuth` (and role checks where
  relevant).
- Media originals stay private (R2) and are served via signed URLs (later phase).
- Don't disable rate limiting, CSRF, or origin checks in production.

## 11. Testing & TDD

Runner is **Vitest** (per-package configs extend `@repo/vitest-config`); E2E is
**Playwright** in `e2e/`. Full guide: [`docs/testing.md`](./docs/testing.md).

- **TDD, enforceable form:** new use-cases and bug fixes **ship with tests**. For a
  bug, write the **failing reproduction test first**, then fix it (red → green →
  refactor). Don't mark work done with the suite red.
- **The pyramid for this repo:**
  - **Many unit** — services (mock the repository with `vi.mock('./repository.js')`),
    contracts schemas, worker job processors. No DB, no network, no infra.
  - **Fewer integration** — Hono routes via `testClient(app)` (`hono/testing`)
    against the **test DB**. Covers validation, the 401 guard, and the authed
    write path (cookie from `createAuthedSession`).
  - **Few E2E** — Playwright smoke + critical user flows across web + api.
- **Test the test DB, never dev/prod.** Integration suites set
  `DATABASE_URL = DATABASE_URL_TEST` via Vitest `env`; `truncateAll()` is guarded
  to refuse any DB not ending in `_test`. Use the factories in `@repo/db/testing`
  (`makeUser/makeDesigner/makeProject`) to seed.
- **Layout:** tests live in a `tests/` dir per package, mirroring `src/`. Unit =
  `*.test.ts`; DB integration = `*.integration.test.ts`.
- **Write deterministic tests:** AAA (arrange-act-assert), test behavior not
  implementation, no real time/random/network in unit tests.
- **Before done:** `pnpm test` (unit + integration) must pass; run `pnpm test:e2e`
  before merging user-facing flows. New API modules add a `service.test.ts` and a
  `routes.integration.test.ts` (see the projects module as the template).

---

## Don't

- ❌ Import `@repo/db`/Drizzle in a service or route.
- ❌ Inline a request/response shape instead of using `@repo/contracts`.
- ❌ `process.env.X` outside `@repo/config`.
- ❌ `db:push` against a shared database; hand-edit an applied migration.
- ❌ `.use()` mid-`.openapi()`-chain to add auth (use the route `middleware` field).
- ❌ `npm install` / `yarn`; inline-pin a dep that belongs in the catalog.
- ❌ Mark a component `'use client'` just to fetch data.
- ❌ Store large payloads in a queue job; assume a job runs exactly once.

## Sources

- Hono: [zod-openapi](https://hono.dev/examples/zod-openapi), [RPC](https://hono.dev/docs/guides/rpc)
- Drizzle: [PostgreSQL best practices](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717), [migrations](https://orm.drizzle.team/docs/migrations)
- better-auth: [best-practices skill](https://github.com/better-auth/skills/blob/main/better-auth/best-practices/SKILL.md), [security](https://better-auth.com/docs/reference/security), [sessions](https://better-auth.com/docs/concepts/session-management)
- Zod v4: [basics](https://zod.dev/basics), [api](https://zod.dev/api)
- BullMQ: [going to production](https://docs.bullmq.io/guide/going-to-production), [retries](https://docs.bullmq.io/guide/retrying-failing-jobs), [concurrency](https://docs.bullmq.io/guide/workers/concurrency)
- Next.js 16: [server & client components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [fetching data](https://nextjs.org/docs/app/getting-started/fetching-data), [production checklist](https://nextjs.org/docs/app/guides/production-checklist)
- Turborepo: [structuring a repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)
