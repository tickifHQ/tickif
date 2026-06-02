# Homefolio

Discovery + portfolio platform for real interior design projects in India.
pnpm + Turborepo monorepo. **Modular monolith** backend (Hono) — clean internal
seams that can be split into services later, not premature microservices.

## Stack

| Layer        | Tech                                                              |
| ------------ | ---------------------------------------------------------------- |
| Frontend     | Next.js 16 (App Router), Tailwind v4, TypeScript                 |
| Backend API  | Hono (`@hono/node-server`) + `@hono/zod-openapi`                 |
| Auth         | better-auth (Phone OTP + Gmail SSO, admin/organization RBAC)      |
| DB           | PostgreSQL 16 + Drizzle ORM (`casing: snake_case`)               |
| Queue        | BullMQ + Redis (ioredis)                                         |
| API docs     | OpenAPI 3.1 → Scalar at `/docs`                                  |
| Validation   | Zod v4, shared via `@repo/contracts`                            |

## Layout

```
apps/
  web/      Next.js frontend (typed hc<AppType> client)
  api/      Hono modular monolith — src/modules/<domain>/{routes,service,repository}
  worker/   BullMQ workers (media pipeline, indexing)
packages/
  db/         Drizzle client + schema (domain + better-auth tables, one migration set)
  auth/       better-auth instance + plugins
  contracts/  Shared Zod schemas + inferred types (single source of truth FE/BE)
  config/     Zod-validated env loader
  tsconfig/   Shared TS configs
  eslint-config/  Shared flat ESLint config
```

## Architectural rule (enforced by convention + review)

Dependency direction inside every API module:

- **routes** — the only layer importing Hono. Validates via `@repo/contracts`, delegates to the service.
- **service** — business logic. Imports neither Hono nor Drizzle.
- **repository** — the only layer importing Drizzle.

## Documentation

Full onboarding & reference docs live in [`docs/`](./docs/README.md):

- [Getting Started](./docs/getting-started.md) — run the stack locally
- [Architecture](./docs/architecture.md) — the modular monolith & layering rule
- [Adding a Module](./docs/adding-a-module.md) — the everyday how-to
- [Database & Migrations](./docs/database-and-migrations.md)
- [Auth](./docs/auth.md) · [Conventions](./docs/conventions.md) · [Troubleshooting](./docs/troubleshooting.md)

**AI coding agents:** rules live in [`CLAUDE.md`](./CLAUDE.md) (canonical), mirrored
for [Cursor](./.cursor/rules/homefolio.mdc) and [Copilot](./.github/copilot-instructions.md).

## Getting started

```bash
pnpm install
cp .env.example .env          # set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm infra:up                 # Postgres + Redis via docker compose
pnpm db:generate && pnpm db:migrate
pnpm dev                      # api :3001, web :3000, worker
```

- API docs (Scalar): http://localhost:3001/docs
- OpenAPI spec: http://localhost:3001/openapi.json
- Web: http://localhost:3000

### Useful scripts

```bash
pnpm typecheck      # turbo: tsc --noEmit across the workspace
pnpm lint           # turbo: eslint
pnpm build          # turbo: build all
pnpm db:studio      # drizzle studio
pnpm --filter @repo/worker enqueue:demo   # prove the queue path
```

## Status

`auth` + `projects` are wired end-to-end as the proving vertical slice. Remaining
blueprint domains (designers, media, leads, search, billing, reviews, bookings,
taxonomy, reports) have reserved module folders and land in later phases.
