# Troubleshooting

Real issues we hit setting this up, plus common ones you'll meet. Each entry has
the symptom, the cause, and the fix.

## Setup & runtime

### "Invalid environment configuration" at startup

**Symptom:** an app exits immediately listing env var issues.
**Cause:** `@repo/config` validated `.env` and something is missing/malformed.
**Fix:** read the message — it names the bad vars. Ensure `.env` exists
(`cp .env.example .env`) and `BETTER_AUTH_SECRET` is set
(`openssl rand -base64 32`). `@repo/config` autoloads the root `.env` from any
subdirectory, so you don't need to export anything.

### App can't connect to Postgres/Redis

**Symptom:** ECONNREFUSED on 5432 or 6379.
**Cause:** containers aren't up.
**Fix:** `pnpm infra:up`, then `docker compose ps` to confirm both are healthy.
The default `DATABASE_URL`/`REDIS_URL` in `.env.example` match the compose file.

### Migration fails / tables missing

**Fix:** `pnpm db:migrate`. If local data is wedged, reset it:
```bash
pnpm infra:down && docker volume rm homefolio_postgres_data
pnpm infra:up && pnpm db:migrate
```

## pnpm & dependency issues

### Duplicate dependency versions cause weird type/runtime errors

**Symptom (the one we hit):** the worker wouldn't typecheck — a `Redis` instance
was "not assignable to ConnectionOptions", deep in ioredis internals.
**Cause:** two copies of `ioredis` in the tree (ours via the catalog, and the one
**bullmq** bundles). Two copies of a class with private fields are nominally
incompatible, even at the same version line.
**Fix used:** don't share a constructed ioredis **instance** with BullMQ — pass a
**connection-options object** instead (`apps/worker/src/connection.ts`). BullMQ
owns the client; no instance type crosses the boundary. We also removed the
direct `ioredis` dependency so only bullmq's copy remains.
**General lesson:** when you see "type X not assignable to X", run
`pnpm why <pkg> -r` to check for duplicates. Use the catalog to keep versions
aligned; a pnpm `overrides` block in the root `package.json` can force a single
version when a transitive dep insists on its own.

### better-auth + drizzle: "two versions of drizzle-orm"

**Symptom:** peer-dependency warnings about `drizzle-orm`, and the auth adapter
behaving oddly.
**Cause:** the standalone `@better-auth/cli` package lagged the `better-auth`
version and dragged in an older `drizzle-orm`, splitting the version.
**Fix:** we do **not** install `@better-auth/cli` as a dependency. The
`pnpm --filter @repo/auth generate` script invokes it via `npx @better-auth/cli@latest`
on demand instead. Keeps a single `drizzle-orm`.

## API / Hono

### "Property 'openapi' does not exist on type 'Hono<...>'"

**Symptom:** type error after adding a `.use()` in a routes file.
**Cause:** `.use()` on an `OpenAPIHono` returns a plain `Hono`, which doesn't have
`.openapi()` — so chaining `.openapi().use().openapi()` breaks.
**Fix:** attach middleware (like `requireAuth`) via the **route definition's
`middleware` field**, keeping the `.openapi()` chain unbroken:
```ts
const r = createRoute({ /* ... */, middleware: [requireAuth] as const });
```
See [adding-a-module.md](./adding-a-module.md).

### A new route doesn't appear in the web client's types

**Cause:** `AppType` is `typeof routes` — the chained value in `app.ts`. If you
mounted your module on `app` outside that chain, it's not in the type.
**Fix:** add your `.route('/api/x', xRoutes)` **into the `routes` chain** in
`apps/api/src/app.ts`.

### 401 where you expected a 422 validation error

**Not a bug.** Auth middleware runs before body validation, so an unauthenticated
request to a guarded route returns 401 before Zod ever checks the body.

## Build & deploy

### `node dist/server.js` → ERR_MODULE_NOT_FOUND for a `@repo/*` file

**Symptom:** the built app can't find `packages/db/src/client.js` etc.
**Cause:** internal packages export **TypeScript source**, which plain Node can't
load. A bare `tsc` build of an app doesn't compile its workspace deps.
**Fix:** the api/worker `build` uses **tsup**, which inlines the `@repo/*` source
into the bundle (`noExternal: [/^@repo\//]`). npm deps stay external and resolve
from `node_modules`. Run `pnpm --filter @repo/api build` then `node dist/server.js`.

### tsup full-bundling fails on better-auth (kysely adapter)

**Symptom:** `No matching export ... DEFAULT_MIGRATION_LOCK_TABLE` during build.
**Cause:** trying to bundle **all** deps inlines better-auth's optional kysely
adapter, which has a CJS/ESM interop issue.
**Fix:** only inline workspace packages (`noExternal: [/^@repo\//]`), keep npm
deps external. The genuinely-used runtime deps (`better-auth`, `drizzle-orm`,
`pg`, `dotenv`) are declared as **direct deps of `apps/api`** so they resolve at
runtime under pnpm's isolated layout. (Worker keeps `bullmq`/`dotenv` direct.)

### Dev works but env isn't picked up in some command

`@repo/config` walks up from the current directory to find the root `.env`. If a
tool runs from an unexpected cwd and can't find it, pass `--env-file=<path>` or
run the command from the repo root.

## Quick diagnostics

```bash
pnpm why <pkg> -r          # find duplicate versions of a dependency
docker compose ps          # are Postgres/Redis healthy?
docker compose logs -f postgres
pnpm --filter @repo/api dev    # run a single app to isolate its output
curl http://localhost:3001/health
pnpm db:studio             # browse the database
```
