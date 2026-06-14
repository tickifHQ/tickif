# Architecture

## The shape: a modular monolith

The product blueprint describes "10+ backend services." We deliberately do **not**
build those as separate deployables. For our team size and timeline, that would
be premature microservices — distributed-systems overhead with none of the
payoff at this scale.

Instead the API is a **modular monolith**: one Hono app, internally split into
domain modules with clean boundaries. Each module is shaped so it could be lifted
into its own service later by moving a folder — but until there's a real reason
(independent scaling, separate teams), it ships as one process.

## Monorepo layout

```
apps/
  web/      Next.js 16 (App Router) + Tailwind v4 — all UI, SSR/SSG, SEO
  api/      Hono modular monolith — the single backend deployable
  worker/   BullMQ workers — async jobs (media pipeline, search indexing)

packages/
  db/             Drizzle client + schema (domain + better-auth), migrations
  auth/           better-auth instance + plugins
  contracts/      Shared Zod schemas + inferred types (the FE/BE contract)
  config/         Zod-validated env loader
  storage/        R2 (S3 API) wrapper — presign, get/put/delete, key builders
  queue/          BullMQ queues + typed enqueue helpers (the API↔worker contract)
  tsconfig/       Shared TypeScript base configs
  eslint-config/  Shared flat ESLint config
```

Tooling: **pnpm workspaces** (package management + the version catalog) and
**Turborepo** (task running + caching). `turbo.json` defines the task graph;
`dependsOn: ["^build"]` ensures dependencies build before dependents.

## Why these packages exist

| Package | Responsibility | Imported by |
| --- | --- | --- |
| `@repo/config` | Parse + validate env once, expose a typed `config`. Autoloads root `.env`. | everything |
| `@repo/contracts` | Zod schemas = the single source of truth for request/response shapes. Plain zod, no framework deps, so the web app can import it too. | api, web |
| `@repo/db` | Drizzle client + the full schema (domain **and** better-auth tables) + migrations. | api, auth, worker |
| `@repo/auth` | The configured better-auth instance (plugins, adapters). | api |
| `@repo/storage` | R2 (S3-compatible) wrapper: presigned PUTs (content-type + length pinned), get/put/delete, deterministic key builders. | api, worker |
| `@repo/queue` | BullMQ queue definitions + typed `enqueue*` helpers. Owns job ids (`media-{imageId}`) and default retry/backoff. | api, worker |

Keeping these as packages (not folders in `apps/api`) means the web app and
worker can share exactly the same contracts, env rules, and DB types without
duplicating them.

## The layering rule (read this twice)

Inside every API module, there are exactly three layers and dependencies flow
one direction:

```
   HTTP request
        │
        ▼
   routes.ts        ← the ONLY file that imports Hono.
        │             Validates input via @repo/contracts, calls the service,
        │             maps the result to an HTTP response. No business logic.
        ▼
   service.ts       ← business logic / use-cases.
        │             Imports the repository + contracts. Imports NEITHER Hono
        │             NOR Drizzle. Throws AppError for domain failures.
        ▼
   repository.ts    ← the ONLY file that imports Drizzle (@repo/db).
                      Returns framework-free records.
```

Why this matters:

- **Testability** — services are pure logic; test them with a fake repository,
  no HTTP server or database required.
- **Swappability** — the HTTP framework and the ORM each touch exactly one layer.
- **Clean extraction** — when a module graduates to its own service, the seams
  are already cut.

The reference implementation is `apps/api/src/modules/projects/`. Copy its shape
for every new module — see [adding-a-module.md](./adding-a-module.md).

## How a request flows (the projects slice)

```
Browser / web app
   │  hc<AppType> typed call  (no codegen — types come from the Hono app)
   ▼
apps/api/src/app.ts            composes modules, applies logging/CORS/session
   │  .route('/api/projects', projectsRoutes)
   ▼
modules/projects/routes.ts     OpenAPIHono route, validates with @repo/contracts
   ▼
modules/projects/service.ts    use-case logic, returns a ProjectResponse
   ▼
modules/projects/repository.ts Drizzle query against @repo/db
   ▼
PostgreSQL
```

The same route definitions that serve traffic also generate the OpenAPI spec
(`/openapi.json`) and the Scalar docs (`/docs`), and export `AppType` — which the
web app consumes for compile-time-safe calls with **no code generation step**.

## How an upload flows (the media slice)

Image bytes never pass through the API — the client uploads straight to R2:

```
Web app
   │  POST /api/media/upload-url  { projectId, contentType, size }
   ▼
media/service.ts → @repo/storage.presignUpload   creates a 'processing' row,
   │                                              returns a presigned PUT URL
   │                                              (content-type + length pinned)
   ▼
Client PUT bytes ───────────────────────────────────────────────►  R2 (originals/, private)
   │
   │  POST /api/media/{imageId}/commit
   ▼
media/service.ts → @repo/queue.enqueueMedia      HEAD-checks the object exists,
   │  (jobId = media-{imageId})                   then enqueues; returns 202
   ▼
apps/worker  media-process.ts                    download → validate → pHash dedup →
   │                                              strip EXIF + derive watermarked
   │                                              webp/avif → write derivatives →
   ▼                                              compare-and-swap status to 'ready'
R2 (derivatives/, public)  +  project_image row updated
```

Permanent failures (oversize/invalid/duplicate) flip the row to `failed` and delete
the orphan original; transient errors retry via BullMQ. See
[ADR 0002](./adr/0002-media-pipeline.md).

## Async work: the worker

Anything slow or retryable (image processing, search indexing, notifications)
goes on a **BullMQ** queue backed by Redis, processed by `apps/worker`. The API
enqueues; the worker consumes. Queue names + typed enqueue helpers are the contract
between them (`@repo/queue`). Two queues run today: `media` (the Sharp image
pipeline) and `sms` (OTP delivery). The worker exposes `/livez` + `/readyz` on
`WORKER_HEALTH_PORT` (default 3002) and drains gracefully on SIGTERM.

## Build & deploy model

- **web** → `next build` (`.next`), deploy to Vercel or a Node host.
- **api** and **worker** → bundled with **tsup** into a self-contained
  `dist/*.js`. Workspace (`@repo/*`) packages are inlined; npm deps stay external
  and resolve from `node_modules`. Run with `node dist/...`. See
  [troubleshooting.md](./troubleshooting.md) for why we bundle rather than ship
  raw `tsc` output.

## What's built vs. planned

Built end-to-end: **auth**, **projects**, and the **media pipeline** (upload →
commit → queue → worker → derive, see [ADR 0002](./adr/0002-media-pipeline.md)).
Reserved (empty module folders, built in later phases): designers, leads, search,
billing, reviews, bookings, taxonomy, reports.
