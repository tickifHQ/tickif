# Golden Rules (non-negotiable)

Scope: **always**. These are cross-cutting and override generic habits.

1. **Respect the layering.** In every API module: `routes.ts` (only Hono) →
   `service.ts` (no Hono, no Drizzle) → `repository.ts` (only Drizzle). Never
   import Drizzle or `@repo/db` outside a repository. Never put business logic in
   a route. (Details: [api.md](./api.md), [database.md](./database.md).)
2. **Contracts are the single source of truth.** All request/response shapes are
   Zod schemas in `@repo/contracts`. Never inline-define a shape in a route or
   re-declare it in the web app — import it. (Details: [validation.md](./validation.md).)
3. **Never read `process.env` directly.** Add the var to the Zod schema in
   `packages/config/src/index.ts` + `.env.example`, then import typed `config`
   from `@repo/config`.
4. **pnpm only.** Never run `npm`/`yarn`. Versions come from the catalog in
   `pnpm-workspace.yaml` (`"catalog:"`), not inline pins. (Details: [monorepo.md](./monorepo.md).)
5. **Migrations are generated, reviewed, and committed.** `pnpm db:generate` →
   review SQL → `pnpm db:migrate`. **Never** `db:push` to a shared/prod DB. Commit
   the migration with its schema change. (Details: [database.md](./database.md).)
6. **Type-safe end to end.** No `any`. No `@ts-ignore` without a comment. The web
   app calls the API via `hc<AppType>` — keep new routes in the `app` chain in
   `apps/api/src/app.ts` so they appear in `AppType`.
7. **Tests ship with the change.** New use-cases and bug fixes include tests; for a
   bug write the failing reproduction first. (Details: [testing.md](./testing.md).)
8. **Verify before claiming done.** `pnpm typecheck && pnpm lint && pnpm test`
   (plus the relevant app) must pass before declaring a task complete.
