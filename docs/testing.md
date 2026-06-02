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
pnpm test            # all unit + integration (turbo, cached)
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

## One-time setup

```bash
pnpm infra:up
docker exec homefolio-postgres createdb -U homefolio homefolio_test   # once
# Optionally set DATABASE_URL_TEST in .env (defaults to the line above).
pnpm test
```

The integration global-setup prints the DB it migrated — confirm it ends in
`_test`.

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
