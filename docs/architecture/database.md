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

## Scope-specific project budgets

The taxonomy seed keeps the eight shared project budget bands and two additional
Design fee bands (`under-1l`, `2l-4l`). In the project editor, the existing `design`
delivery scope corresponds to the feedback's “Design change” scope: its first two
cost choices are Under ₹1L and ₹2L–₹4L, followed by the unchanged six larger bands.
Interior execution and Construction retain all eight shared choices. Saved
global, Design or retired budgets remain selected when editing or changing scope;
switching scope never silently changes a saved budget. Stable distinct slugs allow
API persistence, public detail labels and discovery filters to retain the exact
chosen range. Deployment must run the ordinary taxonomy seed before verifying
the new choices; no project rewrite or schema migration is needed.

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

## Custom locations and October taxonomy feedback

Designers create reusable cities and city-scoped localities through
`POST /api/taxonomy/locations`. The upload editor resolves custom names to active
taxonomy terms before saving a project, so homepage location filters and search
use the same canonical slugs. Repeated creation reuses existing terms; inactive
terms remain inactive. Room, city, locality, material, finish, property-subtype and
budget catalogs use `no-store` at the API, browser typed client and homepage Next
fetch boundaries. This shared policy bypasses previously warmed browser HTTP
caches and seven-day Next data caches when a release seeds new choices; unrelated
preset kinds retain their existing caching. The deployment seed also classifies previously saved free-text
`cityName` projects for location filters. It locks each canonical project and
resolves the live and pending versions from their own names, preserving authored
content, review state and timestamps. Changed live rows enqueue transactional
search projection events; pending-only classification never indexes private
content. Invalid names, inactive cities and deleted projects remain unchanged.
See [ADR 0010](../adr/0010-saved-custom-location-classification.md).

The combined Material & finish picker tags its standard choices as both materials
and finishes, so the homepage material filter and typed search find those photos.
The idempotent taxonomy seed includes the requested material/finish vocabulary
and a standalone `hospital` subtype of `commercial-workspace`. Legacy
`clinic-hospital` remains under `institutional-public` for saved projects.
Deployment must rerun `pnpm db:seed` before verifying these additional choices.
Custom locations do not infer GPS coordinates: nearby recommendations currently
use a selected city and the project's existing location metadata.
