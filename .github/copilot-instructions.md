# Homefolio — Copilot Instructions

Canonical rules: [`CLAUDE.md`](../CLAUDE.md). Explanations: [`docs/`](../docs/README.md).
Follow them. Condensed essentials below.

## Architecture

Modular-monolith API (Hono) + Next.js web + BullMQ worker in a pnpm + Turborepo
monorepo. Per API module, dependencies flow one way:

```
routes.ts (only Hono) → service.ts (no Hono, no Drizzle) → repository.ts (only Drizzle)
```

Reference implementation: `apps/api/src/modules/projects/`.

## Must-follow rules

- **Contracts first:** request/response shapes are Zod schemas in `@repo/contracts`
  (framework-free). Import them everywhere; never inline or duplicate a shape.
- **Config:** never `process.env` directly — add to `packages/config` Zod schema +
  `.env.example`, import `config` from `@repo/config`.
- **DB:** only repositories import `@repo/db`. Index foreign keys; `pgEnum` for
  closed sets; `.$type<T>()` for JSONB; camelCase keys → snake_case columns.
  Migrations: `db:generate` → review → `db:migrate` → commit. Never `db:push` to
  shared DBs.
- **Hono:** guard routes via the `createRoute` `middleware: [requireAuth]` field,
  not a chained `.use()`. Validate with `c.req.valid(...)`. Throw `AppError`.
  Keep new routes in the `routes` chain in `app.ts` (drives `AppType`).
- **Zod v4:** define schemas at module scope; prefer `safeParse`; `.meta({id})`;
  `z.coerce.*` for query/params.
- **better-auth:** secret/URL from env; after plugin changes regenerate schema and
  migrate; prod uses secure cookies + trustedOrigins + CSRF + Redis sessions.
- **BullMQ:** idempotent jobs, exponential backoff, bounded retention, small
  payloads (IDs, not blobs), connection **options** not an ioredis instance,
  graceful shutdown.
- **Next.js 16:** Server Components by default; `await` `params`/`searchParams`;
  `'use client'` only at leaves; use the typed `hc` API client.
- **Tooling:** pnpm only; shared versions via the `pnpm-workspace.yaml` catalog;
  no `any`; `import type` for types. Run `pnpm typecheck && pnpm lint` before done.
