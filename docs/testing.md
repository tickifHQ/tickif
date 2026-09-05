# Testing & TDD

We practice **test-driven development**: new use-cases and bug fixes ship with
tests, and for a bug you write the **failing reproduction test first**. Runner is
**Vitest**; end-to-end is **Playwright**.

## The pyramid for this repo

```
        ▲  few    E2E (Playwright)        full-stack smoke + critical flows
       ▲▲▲        integration (Vitest)    Hono routes via testClient + test DB
      ▲▲▲▲▲ many  unit (Vitest)           services, contracts, worker jobs — no DB
```

The layering rule is what makes the base of the pyramid cheap: a `service.ts`
depends only on a repository interface, so you test it with a fake — no database,
no HTTP, no infra.

## Layout & naming

Tests live in a `tests/` directory per package, mirroring `src/`:

```
apps/api/tests/modules/projects/
  service.test.ts              # unit  (no DB)
  routes.integration.test.ts   # integration (test DB)
```

- **Unit:** `*.test.ts` — pure, fast, no infra.
- **Integration:** `*.integration.test.ts` — uses the test database.

In `apps/api` these are two Vitest *projects* (`unit`, `integration`); only the
integration project wires up the DB.

## Commands

```bash
pnpm verify          # clean gate: typecheck, then lint, then unit + integration
pnpm test            # all unit + integration (always executes; no result cache)
pnpm test:watch      # watch mode
pnpm test:coverage   # with coverage
pnpm test:e2e        # Playwright (needs the running stack — see below)

pnpm --filter @repo/api test               # one package
pnpm --filter @repo/api test -- service    # one file/pattern
```

## Unit tests — services with a fake repository

Services hard-import the repository singleton, so we substitute it with
`vi.mock`. This is the canonical pattern (see
`apps/api/tests/modules/projects/service.test.ts`):

```ts
vi.mock('../../../src/modules/projects/repository.js', () => ({
  projectsRepository: { list: vi.fn(), findById: vi.fn(), /* ... */ },
}));
const { projectsService } = await import('../../../src/modules/projects/service.js');
```

Then drive behavior: `getById` on a missing row throws `AppError(404)`, `create`
appends a slug suffix on collision, etc. No database is touched.

## Integration tests — routes against the test DB

The key mechanism: repositories and `auth` use a module-singleton `db` bound to
`DATABASE_URL` at import. The Vitest config sets `DATABASE_URL = DATABASE_URL_TEST`
**before** `@repo/config` loads, so the singleton points at the test DB:

- `tests/global-setup.ts` migrates the test DB once.
- `tests/setup.ts` runs `truncateAll()` before each test (guarded — it refuses any
  DB whose name doesn't end in `_test`).
- Seed with factories from `@repo/db/testing`: `makeUser`, `makeDesigner`,
  `makeProject`.

Routes are exercised with Hono's built-in `testClient` (no network):

```ts
const client = testClient(app);
const res = await client.api.projects.$get({ query: {} });
```

For the **authenticated** path, `createAuthedSession()`
(`apps/api/tests/helpers/auth.ts`) runs the real phone-OTP flow against the test
DB and returns a `Cookie` header — so the `POST → 201` path is tested for real:

```ts
const { cookie } = await createAuthedSession();
const res = await client.api.projects.$post({ json: {...} }, { headers: { cookie } });
```

## Clean-checkout gate setup

Use Node >=22.13 and the pinned pnpm version. No `.env` file or auth/provider
secrets are needed for the Vitest gate. The shared presets inject a synthetic
test-only auth secret and localhost auth URL. Integration global setup installs
the same project environment before importing the DB singleton; Vitest's
`test.env` alone only applies in test workers. Application environment validation
is unchanged and still rejects missing auth settings, including in production.

Postgres, Redis and Typesense must be running locally. The default Compose
credentials and ports match the test defaults; MinIO is only needed for live
upload/E2E work (Vitest storage calls are mocked or signed locally).

```bash
pnpm install --frozen-lockfile
docker compose up -d --wait postgres redis typesense
docker exec tickif-postgres createdb -U tickif tickif_test
docker exec tickif-postgres createdb -U tickif tickif_worker_test
pnpm verify
```

Create the databases once; an "already exists" response on later setup runs is
expected. Do not drop or recreate them to run the gate. Integration global setup
migrates them automatically. The API uses `tickif_test`; worker suites use
`tickif_worker_test`, so one suite cannot truncate the other's data. Both names
must end in `_test`. API global setup prints its redacted connection target.

The queue target defaults to Redis DB 15. API setup clears only the test SMS
queue and refuses Redis DB 0. Use a dedicated disposable Redis index for each
simultaneous worktree. Worker search integration bootstraps its test collections.
For non-default services, set `DATABASE_URL_TEST`, `REDIS_URL_TEST`,
`TYPESENSE_HOST`, `TYPESENSE_API_KEY` and `TYPESENSE_SEARCH_API_KEY`. Keep all targets
local/disposable. `DATABASE_URL` is intentionally ignored for test DB selection.

For parallel worktrees, an isolated PowerShell example is:

```powershell
docker exec tickif-postgres createdb -U tickif tickif_stage13_test
docker exec tickif-postgres createdb -U tickif tickif_stage13_worker_test
$env:DATABASE_URL_TEST = 'postgresql://tickif:tickif@localhost:5432/tickif_stage13_test'
$env:REDIS_URL_TEST = 'redis://localhost:6379/13'
$env:TYPESENSE_COLLECTION_PREFIX = 'tickif_stage13'
pnpm verify
```

An override ending in `example_test` derives the worker database
`example_worker_test`. Select different names, Redis indices and Typesense
prefixes for each worktree; do not reuse another running suite's targets.

The root gate runs at most two Turbo package tasks simultaneously, and shared
Vitest presets cap file workers at two. API/worker DB files remain serialized
within each integration project. This bounds nested parallelism without
increasing UI assertion or test timeouts. On memory-constrained machines, use
`pnpm test --concurrency=1`. Avoid running multiple full gates concurrently on
the same host. Unit/integration results are never reused from Turbo's cache,
because database, Redis and Typesense state can change without source changes.

## E2E (Playwright)

`e2e/` is its own workspace (`@repo/e2e`). `playwright.config.ts` boots the api +
web (`webServer`) pointed at the test DB, then runs the specs in `e2e/tests/`.

```bash
pnpm infra:up && pnpm db:migrate            # stack + (test) DB ready
pnpm --filter @repo/e2e test:e2e:install    # first time: install browsers
pnpm test:e2e
```

Current scope is a full-stack **smoke** (home renders; API health/projects/OpenAPI
served). The authenticated write path is covered at the integration layer; an
authed *UI* flow plugs in here once login UI exists, reusing the same session
helper.

## Conventions

- AAA (arrange-act-assert); test **behavior, not implementation**.
- Deterministic: no real time/network/random in unit tests; use factories.
- Never point a test at the dev/prod database.
- `pnpm test` green before "done"; `pnpm test:e2e` before merging user-facing flows.
