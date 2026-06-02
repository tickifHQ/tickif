# Testing & TDD

Scope: `**/tests/**`, `**/*.test.*`, `e2e/**`. Full guide: [`docs/testing.md`](../docs/testing.md).

Runner is **Vitest** (per-package configs extend `@repo/vitest-config`); E2E is
**Playwright** in `e2e/`.

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
  to refuse any DB not ending in `_test`. Seed with `@repo/db/testing` factories
  (`makeUser/makeDesigner/makeProject`).
- **Layout:** tests live in a `tests/` dir per package, mirroring `src/`. Unit =
  `*.test.ts`; DB integration = `*.integration.test.ts`.
- **Write deterministic tests:** AAA (arrange-act-assert), test behavior not
  implementation, no real time/random/network in unit tests.
- **Before done:** `pnpm test` (unit + integration) must pass; run `pnpm test:e2e`
  before merging user-facing flows. New API modules add a `service.test.ts` and a
  `routes.integration.test.ts` (projects module is the template).

## Don't

- ❌ Point a test at the dev/prod database.
- ❌ Land a feature or bug fix with no test.
- ❌ Use real time/random/network in unit tests.
