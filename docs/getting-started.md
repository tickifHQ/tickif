# Getting Started

Goal: a fully running local stack — API, web, worker, Postgres, Redis — in about
five minutes.

## 1. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | >= 20 (22 LTS recommended) | `node -v` |
| pnpm | >= 10 | `corepack enable && corepack prepare pnpm@latest --activate`, or `npm i -g pnpm` |
| Docker | any recent | For local Postgres + Redis via `docker compose` |

This repo is a **pnpm workspace**. Do not use `npm` or `yarn` here — it will
break the lockfile and the `workspace:*` / `catalog:` references.

## 2. Install dependencies

```bash
pnpm install
```

Dependency versions are centralized in a **pnpm catalog** (see
`pnpm-workspace.yaml`). Reference them in any `package.json` as `"catalog:"`
rather than pinning a version inline — see [conventions.md](./conventions.md).

## 3. Configure environment

```bash
cp .env.example .env
```

Then set a real auth secret in `.env`:

```bash
# prints a value to paste into BETTER_AUTH_SECRET
openssl rand -base64 32
```

The defaults in `.env.example` already match the Docker Postgres/Redis below, so
that's the only value you must change to boot. `GOOGLE_CLIENT_ID/SECRET` are only
needed if you're working on Gmail SSO; phone-OTP login works without them.

> Env is loaded and **validated** by `@repo/config` (`packages/config/src/index.ts`).
> If a required var is missing or malformed, the app fails fast at startup with a
> readable error. `@repo/config` also autoloads the root `.env` by walking up from
> the current directory, so every workspace command picks it up — you don't need
> to export anything.

## 4. Start infrastructure

```bash
pnpm infra:up      # docker compose up -d  (Postgres 16 + Redis 7)
```

Check they're healthy:

```bash
docker compose ps
```

Stop them later with `pnpm infra:down` (data persists in Docker volumes).

## 5. Apply the database schema

```bash
pnpm db:migrate
```

This applies the committed migrations in `packages/db/migrations/`. You should
see 11 tables created (7 better-auth + 4 domain). See
[database-and-migrations.md](./database-and-migrations.md).

## 6. Run everything

```bash
pnpm dev
```

Turborepo starts all three apps in parallel:

- **API** → <http://localhost:3001> (`/health`, `/docs`, `/openapi.json`)
- **Web** → <http://localhost:3000>
- **Worker** → listening on the `media` queue

To run just one app: `pnpm --filter @repo/api dev` (or `@repo/web`, `@repo/worker`).

## 7. Smoke-test it

```bash
# API health
curl http://localhost:3001/health

# List projects (empty until you create some)
curl http://localhost:3001/api/projects

# Prove the queue path: enqueue a demo job, watch the worker log process it
pnpm --filter @repo/worker enqueue:demo
```

Open <http://localhost:3001/docs> for the interactive Scalar API reference.

## 8. Run the tests

```bash
docker exec homefolio-postgres createdb -U homefolio homefolio_test   # once
pnpm test          # unit + integration (Vitest)
pnpm test:e2e      # Playwright (first run: pnpm --filter @repo/e2e test:e2e:install)
```

We practice TDD — see [testing.md](./testing.md).

## Everyday scripts

Run from the repo root:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run all apps (watch mode) |
| `pnpm build` | Build all apps (web → `.next`, api/worker → bundled `dist`) |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm lint` | ESLint across the workspace |
| `pnpm format` | Prettier write |
| `pnpm db:generate` | Generate a new migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:studio` | Open Drizzle Studio (DB browser) |
| `pnpm infra:up` / `infra:down` | Start / stop Postgres + Redis |

Stuck? See [troubleshooting.md](./troubleshooting.md).
