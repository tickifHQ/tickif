# Getting Started

Goal: a fully running local stack — API, web, worker, Postgres, Redis — in about
five minutes.

## 1. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | >= 22.13.0 (22 LTS) | `node -v` |
| pnpm | >= 10 | `corepack enable && corepack prepare pnpm@latest --activate`, or `npm i -g pnpm` |
| Docker | any recent | For local Postgres + Redis + MinIO via `docker compose` |

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

### Production delivery providers

Production uses three external delivery/storage providers. Keep their credentials
in the deployment secrets manager, never in the repository:

| Capability    | Provider      | Required configuration                                                                               |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| Email         | Resend        | `RESEND_API_KEY`, plus `EMAIL_FROM` set to a verified sender/domain                                  |
| SMS           | Novu          | `SMS_PROVIDER=novu`, `NOVU_SECRET_KEY`, `NOVU_OTP_WORKFLOW_ID`, and `NOVU_BOOKING_WORKFLOW_ID`       |
| Media storage | Cloudflare R2 | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and either `R2_ACCOUNT_ID` or `R2_ENDPOINT` |

`@repo/config` fails production startup when required Resend or R2 values are
missing, and when a deployment selects Novu without its required values.
Development can omit Resend and Novu credentials: email logs metadata only and
SMS uses the console fallback. Production never falls back to console delivery.

## 4. Start infrastructure

```bash
pnpm infra:up      # docker compose up -d  (Postgres 16 + Redis 7 + MinIO)
```

This also starts **MinIO**, a local S3-compatible store standing in for Cloudflare
R2 (API on `:9000`, console on `:9001`).

Check they're healthy:

```bash
docker compose ps
```

Stop them later with `pnpm infra:down` (data persists in Docker volumes).

### Point storage at MinIO and create the bucket

The media pipeline talks to R2 over the S3 API. Locally, point it at MinIO by
setting these in `.env` (the defaults match `docker-compose.yml`'s `minio` service):

```bash
R2_ENDPOINT=http://localhost:9000
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin
R2_BUCKET=tickif-media
```

Create the bucket once — either in the console at <http://localhost:9001> (login
with the keys above) or with `mc`:

```bash
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/tickif-media
```

`R2_*` are only required in production (`@repo/config` enforces them when
`NODE_ENV=production`); locally the pipeline simply can't run until they're set.

## 5. Apply the database schema

```bash
pnpm db:migrate
```

This applies the committed migrations in `packages/db/migrations/`. It creates the
better-auth tables plus the domain tables (project, designer_profile, taxonomy,
project_image, ...). See
[database-and-migrations.md](./database-and-migrations.md) — including the
**destructive migrations** to know about before running against real data.

## 6. Run everything

```bash
pnpm dev
```

Turborepo starts all three apps in parallel:

- **API** → <http://localhost:8008> (`/health`, `/docs`, `/openapi.json`)
- **Web** → <http://localhost:3000>
- **Worker** → listening on the `media` queue

To run just one app: `pnpm --filter @repo/api dev` (or `@repo/web`, `@repo/worker`).

## 7. Smoke-test it

```bash
# API health
curl http://localhost:8008/health

# List projects (empty until you create some)
curl http://localhost:8008/api/projects

# Prove the queue path: enqueue a demo job, watch the worker log process it
pnpm --filter @repo/worker enqueue:demo
```

Open <http://localhost:8008/docs> for the interactive Scalar API reference.

### Media smoke-test (mint → PUT → commit → watch)

Needs MinIO running and `R2_*` set (above), plus an authenticated session cookie
and a project you own. With those in hand:

```bash
# 1. Mint a presigned upload URL (capture imageId, uploadUrl, key)
curl -s -b cookies.txt http://localhost:8008/api/media/upload-url \
  -H 'content-type: application/json' \
  -d '{"projectId":"<PROJECT_ID>","contentType":"image/jpeg","size":2400000}'

# 2. PUT the bytes straight to storage. content-type + length are pinned into the
#    signature, so they MUST match what you declared above.
curl -s -X PUT "<uploadUrl>" \
  -H 'content-type: image/jpeg' \
  --data-binary @photo.jpg

# 3. Commit — enqueues processing, returns 202 { status: 'processing' }
curl -s -b cookies.txt -X POST http://localhost:8008/api/media/<imageId>/commit

# 4. Watch the worker log derive + flip to ready, then list the project's images
curl -s -b cookies.txt http://localhost:8008/api/projects/<PROJECT_ID>/images
```

The worker log shows `media completed job media-<imageId>`; the listed image moves
to `status: 'ready'` with `derivatives` populated. If it goes to `failed`, see the
[media pipeline runbook](./runbooks/media-pipeline.md).

## 8. Run the tests

```bash
docker exec tickif-postgres createdb -U tickif tickif_test   # once
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
| `pnpm infra:up` / `infra:down` | Start / stop Postgres + Redis + MinIO |

Stuck? See [troubleshooting.md](./troubleshooting.md).
