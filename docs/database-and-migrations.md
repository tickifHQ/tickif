# Database & Migrations

We use **PostgreSQL 16** with **Drizzle ORM** and **drizzle-kit** for migrations.
Everything lives in `packages/db`.

## Layout

```
packages/db/
  drizzle.config.ts        drizzle-kit config (dialect, schema path, casing)
  src/
    client.ts              pooled pg connection + Drizzle instance (export `db`)
    index.ts               public exports: db, schema, common operators
    schema/
      auth.ts              better-auth tables (see auth.md)
      domain.ts            domain tables (project, designer_profile, taxonomy, ...)
      index.ts             barrel — re-exports auth + domain
  migrations/              generated SQL migrations (COMMIT THESE)
```

## The casing convention

The Drizzle client is created with `casing: 'snake_case'` (`src/client.ts`), and
`drizzle.config.ts` sets the same. This means:

- In TypeScript you write **camelCase** property keys: `phoneNumberVerified`.
- In Postgres the columns are **snake_case**: `phone_number_verified`.

You usually still pass the explicit column name in the builder (e.g.
`text('phone_number')`) for clarity, but the casing option is what makes
better-auth's field-name expectations line up with our column names. Don't change
it without understanding the auth implications.

## Single migration set (important)

Both the **domain** tables and the **better-auth** tables are defined in the same
Drizzle schema (`schema/auth.ts` + `schema/domain.ts`, unified in
`schema/index.ts`). `drizzle.config.ts` points at that unified schema, so a single
`pnpm db:generate` produces one migration covering everything, and they migrate
together. This is intentional — see [auth.md](./auth.md).

## Workflow: changing the schema

1. Edit a schema file under `packages/db/src/schema/`.
2. Generate a migration:
   ```bash
   pnpm db:generate
   ```
   drizzle-kit diffs your schema against the migration history and writes a new
   timestamped `.sql` file in `packages/db/migrations/`.
3. Review the generated SQL. Drizzle is good, but always read it — especially for
   column drops/renames (it may generate a drop+add instead of a rename).
4. Apply it:
   ```bash
   pnpm db:migrate
   ```
5. **Commit the migration file** along with your schema change. Migrations are
   part of the source of truth; never hand-edit an already-applied migration.

## Useful commands

| Command | What it does |
| --- | --- |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:studio` | Open Drizzle Studio — a browser UI for the DB |
| `pnpm --filter @repo/db push` | Push schema directly without a migration (**dev/prototyping only**, never prod) |

## Destructive migrations

Most migrations are additive and reversible enough. A few are not — read these before
applying against a populated database.

### 0005 — `project_image` reshape for the media pipeline

One-way, expand/contract migration that rebuilds `project_image` for the media pipeline
(adds `original_key`, `derivatives`, `phash`, `status`, `sort_order`; drops `storage_key`,
`content_hash`, `room_slug`, `position`).

- **`room_slug` is unrecoverable.** It is dropped with no replacement column to copy into,
  so its data is gone — there is **no clean rollback**. `original_key`/`phash`/`sort_order`
  only restore if the forward backfill ran.
- **Take a logical backup of `project_image` first** on any populated apply, and recover by
  **forward-fix, not rollback**.
- **Indexes are built non-concurrently** because drizzle wraps each migration in a
  transaction. On a large/persistent table this locks the table — instead skip the index
  statements and **build them `CONCURRENTLY` out-of-band** after the migration. See the
  [media pipeline runbook](./runbooks/media-pipeline.md).

### 0007 — `content_type` NOT NULL + index swap

- Backfills any pre-pipeline `NULL` `content_type` to `application/octet-stream` (so the
  worker rejects those rows on validation rather than the migration aborting on the NOT
  NULL), then sets the column `NOT NULL`.
- Drops the dead `(project_id, phash)` index (a btree can't serve fuzzy/Hamming dedup) and
  adds the covering `(project_id, sort_order, created_at)` index for the list query's
  `ORDER BY`. On a large table, run the DROP/CREATE INDEX `CONCURRENTLY` out-of-band for the
  same reason as 0005.

### 0030 — public project recommendation indexes

- Adds three partial ordering indexes to the existing `project` table for the designer,
  budget-band, and city recommendation groups.
- Drizzle creates these indexes non-concurrently inside the migration transaction. Apply
  this migration before the table is populated or during a write-maintenance window. For
  a large/persistent table, omit the three index statements from the deploy migration and
  build the equivalent indexes with `CREATE INDEX CONCURRENTLY` out-of-band.

## Querying

Import `db`, `schema`, and the common operators from `@repo/db` (re-exported so
you don't depend on `drizzle-orm` directly for simple queries):

```ts
import { db, schema, eq, and, desc, sql } from '@repo/db';

const rows = await db
  .select()
  .from(schema.project)
  .where(and(eq(schema.project.status, 'published'), eq(schema.project.citySlug, 'mumbai')))
  .orderBy(desc(schema.project.createdAt))
  .limit(20);
```

Remember: **only repository files** should import `@repo/db`. See
[architecture.md](./architecture.md).

## Inspecting the local DB directly

```bash
docker exec -it tickif-postgres psql -U tickif -d tickif
# then: \dt   (list tables)   \d project   (describe a table)
```

## Connection

The connection string is `DATABASE_URL` in `.env`. The local default
(`postgresql://tickif:tickif@localhost:5432/tickif`) matches
`docker-compose.yml`. The pool lives in `src/client.ts` and is shared across the
app — don't create ad-hoc connections.

## Resetting local data

```bash
pnpm infra:down            # stops containers
docker volume rm tickif_postgres_data   # wipes Postgres data
pnpm infra:up && pnpm db:migrate
```
