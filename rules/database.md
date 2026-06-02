# Database (Drizzle + PostgreSQL)

Scope: `packages/db/**` and repository files (`apps/api/src/modules/*/repository.ts`).

- **Only repositories import `@repo/db`.** Services and routes never touch Drizzle.
- Organize schema by domain under `packages/db/src/schema/`, re-export via the
  barrel (`schema/index.ts`). Keep auth + domain in the **one** migration set.
- Property keys are camelCase; columns are snake_case via the global
  `casing: 'snake_case'`. Don't change the casing option (load-bearing for
  better-auth field mapping).
- **Index every foreign key.** Add composite indexes most-selective-first; use
  partial indexes (`.where(...)`) for status-filtered hot paths.
- Type JSONB columns with `.$type<T>()`. Use `pgEnum` for closed sets.
- Set `onDelete` cascade/set-null deliberately on FKs.
- `select` only the columns you need on hot paths; consider `.prepare()` for
  repeated queries.
- Migrations: **`generate` for anything shared/prod; `push` only for throwaway
  local prototyping.** Additive-first; for renames/structural changes use
  expand→backfill→contract. Review the generated SQL; commit it with the schema change.
- New high-volume tables: prefer bigint identity or UUIDv7 PKs over random UUIDv4
  (UUIDv4 PKs index poorly). Existing `uuid().defaultRandom()` PKs are fine at
  current scale — don't churn them without reason.

## Don't

- ❌ Import Drizzle/`@repo/db` outside a repository.
- ❌ `db:push` against a shared database, or hand-edit an applied migration.
- ❌ Change the `casing` option without understanding the auth impact.
