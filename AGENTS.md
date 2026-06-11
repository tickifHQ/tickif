# AGENTS.md — Tickif

**Single source of truth** for all AI coding agents (Claude Code, Cursor, Copilot,
Codex, …). There are no tool-specific rule files — every agent reads this file and
the modular rules under [`rules/`](./rules/README.md).

Rules are **enforced conventions**, not suggestions, grounded in the official
best-practice guidance for this stack. When a rule conflicts with a generic habit,
the rule wins.

Rules are split into focused files so you can **load only what's relevant** to the
files you're editing. Prose explanations live in [`docs/`](./docs/README.md).

## How to use these rules

1. **Always apply** [`rules/golden-rules.md`](./rules/golden-rules.md) and
   [`rules/security.md`](./rules/security.md).
2. **Selectively load** the rule file(s) matching what you're touching:

| Editing… | Load |
| --- | --- |
| `apps/api/**` | [api](./rules/api.md) + [validation](./rules/validation.md) + [database](./rules/database.md) + [auth](./rules/auth.md) |
| `apps/web/**` | [frontend](./rules/frontend.md) + [validation](./rules/validation.md) |
| `packages/ui/**` | [frontend](./rules/frontend.md) |
| `apps/worker/**` | [background-jobs](./rules/background-jobs.md) |
| `packages/db/**`, any `repository.ts` | [database](./rules/database.md) |
| `packages/auth/**` | [auth](./rules/auth.md) |
| `packages/contracts/**` | [validation](./rules/validation.md) |
| any `.ts`/`.tsx` | [typescript](./rules/typescript.md) |
| `**/tests/**`, `e2e/**` | [testing](./rules/testing.md) |
| deps / workspace / build | [monorepo](./rules/monorepo.md) |

Each rule file states its scope (and a glob) at the top — see [`rules/README.md`](./rules/README.md).

## Project shape

Modular-monolith API (Hono) + Next.js 16 web + BullMQ worker, in a pnpm + Turborepo
monorepo. Per API module, dependencies flow one way:
`routes.ts` (only Hono) → `service.ts` (no Hono, no Drizzle) → `repository.ts` (only Drizzle).
Reference implementation: `apps/api/src/modules/projects/`.

## Commands

```bash
pnpm install                 # install (pnpm workspace)
pnpm dev                     # run api(:3001) + web(:3000) + worker
pnpm build                   # build all (api/worker → tsup dist, web → .next)
pnpm typecheck               # tsc --noEmit across workspace
pnpm lint                    # eslint across workspace
pnpm test | test:e2e         # Vitest (unit+integration) | Playwright
pnpm db:generate|migrate|studio
pnpm infra:up|down           # Postgres + Redis via docker compose
pnpm --filter @repo/<x> <script>   # target one package/app
```

Before declaring done: `pnpm typecheck && pnpm lint && pnpm test` must pass.

## Sources

- Hono: [zod-openapi](https://hono.dev/examples/zod-openapi), [RPC](https://hono.dev/docs/guides/rpc)
- Drizzle: [PostgreSQL best practices](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717), [migrations](https://orm.drizzle.team/docs/migrations)
- better-auth: [best-practices skill](https://github.com/better-auth/skills/blob/main/better-auth/best-practices/SKILL.md), [security](https://better-auth.com/docs/reference/security), [sessions](https://better-auth.com/docs/concepts/session-management)
- Zod v4: [basics](https://zod.dev/basics), [api](https://zod.dev/api)
- BullMQ: [going to production](https://docs.bullmq.io/guide/going-to-production), [retries](https://docs.bullmq.io/guide/retrying-failing-jobs), [concurrency](https://docs.bullmq.io/guide/workers/concurrency)
- Next.js 16: [server & client components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [fetching data](https://nextjs.org/docs/app/getting-started/fetching-data), [production checklist](https://nextjs.org/docs/app/guides/production-checklist)
- Turborepo: [structuring a repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)
