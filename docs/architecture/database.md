# Database architecture

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
      billing.ts           subscriptions, billing operations and payments
      retention.ts         organization retention lifecycle
      search.ts            search projection outbox
      project-engagement.ts lifetime project view totals
      index.ts             barrel — re-exports all schema domains
  migrations/              generated SQL migrations (COMMIT THESE)
```

## The casing convention

The Drizzle client is created with `casing: 'snake_case'` (`packages/db/src/client.ts`), and
`drizzle.config.ts` sets the same. This means:

- In TypeScript you write **camelCase** property keys: `phoneNumberVerified`.
- In Postgres the columns are **snake_case**: `phone_number_verified`.

You usually still pass the explicit column name in the builder (e.g.
`text('phone_number')`) for clarity, but the casing option is what makes
better-auth's field-name expectations line up with our column names. Don't change
it without understanding the auth implications.

## Single migration set (important)

Both the **domain** tables and the **better-auth** tables are defined in the same
Drizzle schema, alongside billing, retention, search and project-engagement schemas,
unified in `packages/db/src/schema/index.ts`. `drizzle.config.ts` points at that
unified schema, so a single
`pnpm db:generate` produces one migration covering everything, and they migrate
together. This is intentional — see [auth.md](./auth.md).

## Connection

The connection string is `DATABASE_URL` in `.env`. The local default
(`postgresql://tickif:tickif@localhost:5432/tickif`) matches
`docker-compose.yml`. The pool lives in `packages/db/src/client.ts` and is shared across the
app — don't create ad-hoc connections.

For schema changes, migration warnings, repository queries and local inspection, use
[the migration guide](../guides/database-and-migrations.md).

## Room vocabulary

The upload room picker lists every active room taxonomy term, with the project's
suggested rooms first. Designers can create additional room types through
`POST /api/taxonomy/rooms`. Names are limited to 80 characters and normalize to a
unique room slug. Duplicate requests reuse the active term; disabled terms are
not reactivated. Room taxonomy reads revalidate immediately so added types become
available to tagging and discovery filters. Saved rooms retain the taxonomy ID,
and search indexing derives their room slugs from that shared vocabulary.
