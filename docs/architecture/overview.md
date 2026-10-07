# Architecture

## The shape: a modular monolith

The API is a **modular monolith**: one Hono app, internally split into
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
  search/         Typesense client, bootstrap, indexing and queries
  billing/        Subscription lifecycle policy
  google-places/  Google Places integration
  logger/         Shared structured logging and privacy filtering
  telemetry/      OpenTelemetry lifecycle, propagation and metrics
  ui/             Shared components and semantic theme tokens
  tsconfig/       Shared TypeScript base configs
  eslint-config/  Shared flat ESLint config
  vitest-config/  Shared test presets and isolated test targets

e2e/              Playwright workspace and local full-stack test harness
infra/            Versioned provisioning and deployment configuration
docs/             Architecture, coding guidelines, ADRs, guides and runbooks
```

Tooling: **pnpm workspaces** (package management + the version catalog) and
**Turborepo** (task running + caching). `turbo.json` defines the task graph;
`dependsOn: ["^build"]` ensures dependencies build before dependents.

## Why these packages exist

| Package           | Responsibility                                                                                                                        | Imported by       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `@repo/config`    | Parse + validate env once, expose a typed `config`. Autoloads root `.env`.                                                            | everything        |
| `@repo/contracts` | Zod schemas = the single source of truth for request/response shapes. Plain zod, no framework deps, so the web app can import it too. | api, web          |
| `@repo/db`        | Drizzle client + the full schema (domain **and** better-auth tables) + migrations.                                                    | api, auth, worker |
| `@repo/auth`      | The configured better-auth instance (plugins, adapters).                                                                              | api               |
| `@repo/storage`   | R2 (S3-compatible) wrapper: presigned PUTs (content-type + length pinned), get/put/delete, deterministic key builders.                | api, worker       |
| `@repo/queue`     | BullMQ queue definitions + typed `enqueue*` helpers. Owns job ids (`media-{imageId}`) and default retry/backoff.                      | api, worker       |

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
for every new module — see [adding-a-module.md](../guides/adding-a-module.md).

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

## Media pipeline

The browser uploads originals directly to private R2 storage. The API validates and
enqueues processing; the worker derives public images asynchronously. See
[media pipeline architecture](./media-pipeline.md) and [ADR 0002](../adr/0002-media-pipeline.md).

## Async work: the worker

Anything slow or retryable (image processing, search indexing, notifications)
goes on a **BullMQ** queue backed by Redis, processed by `apps/worker`. The API
enqueues; the worker consumes. Queue names + typed enqueue helpers are the contract
between them (`@repo/queue`). Queue definitions cover media, search indexing,
SMS/email delivery, verification, retention and experience refresh; consult
`packages/queue/src/index.ts` for the current inventory. The worker exposes `/livez` + `/readyz` on
`WORKER_HEALTH_PORT` (default 3002) and drains gracefully on SIGTERM.

## Build & deploy model

- **web** builds with Next.js and produces a standalone Node deployment.
- **api** and **worker** bundle workspace packages with **tsup**; npm dependencies
  remain external and must be declared directly by the consuming app. Startup uses
  the telemetry preload/hook defined in each application's `package.json`.
- Versioned staging images deploy through Docker Swarm and Traefik. See the
  [staging deployment runbook](../runbooks/staging-deployment.md) and
  [troubleshooting guide](../guides/troubleshooting.md).

## Domain implementation and product decisions

The API includes projects, profiles/portfolios, discovery/search, taxonomy, leads,
enquiries, reviews, billing, organization access/retention, verification and
moderation. Use `apps/api/src/app.ts` for mounted routes and each module's source
for its implemented behavior.

Consultation scheduling remains disabled by default even though booking code and
tests exist. [ADR 0003](../adr/0003-consultation-enquiries.md) establishes enquiries
as the current public action. Read applicable ADRs before extending a domain.
