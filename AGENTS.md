# AGENTS.md — Tickif

**Single source of truth** for all AI coding agents (Claude Code, Cursor, Copilot,
Codex, …). This file is the common entry point; enforced conventions live in
[`docs/coding-guidelines/`](./docs/coding-guidelines/README.md).

## Start every new job

1. Read [`docs/README.md`](./docs/README.md) and the
   [architecture overview](./docs/architecture/overview.md).
2. Read the [ADR index](./docs/adr/README.md), then the decisions relevant to the
   task. Follow supersession links and amendments to identify the current decision.
3. Always apply [golden rules](./docs/coding-guidelines/golden-rules.md) and
   [security](./docs/coding-guidelines/security.md).
4. Load the architecture documents and scoped coding guidelines for the files
   and domains being touched, using the table below. Consult guides/runbooks for
   the development or operational procedure.
5. Keep affected architecture, guidelines, guides and runbooks synchronized with
   the implementation. Record a new architectural decision in `docs/adr/` using
   its template; preserve historical context and link any superseded decision.

These conventions are enforced, not suggestions. Nested agent instruction files,
if added, must reference this startup procedure and add only scope-specific
instructions; do not duplicate the common rules.

## How to use these rules

1. **Always apply** [`docs/coding-guidelines/golden-rules.md`](./docs/coding-guidelines/golden-rules.md) and
   [`docs/coding-guidelines/security.md`](./docs/coding-guidelines/security.md).
2. **Selectively load** the rule file(s) matching what you're touching:

| Editing…                              | Load                                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/**`                         | [api](./docs/coding-guidelines/api.md) + [validation](./docs/coding-guidelines/validation.md) + [database](./docs/coding-guidelines/database.md) + [auth](./docs/coding-guidelines/auth.md) |
| `apps/web/**`                         | [frontend](./docs/coding-guidelines/frontend.md) + [validation](./docs/coding-guidelines/validation.md)                                                                                     |
| `packages/ui/**`                      | [frontend](./docs/coding-guidelines/frontend.md)                                                                                                                                            |
| `apps/worker/**`                      | [background-jobs](./docs/coding-guidelines/background-jobs.md)                                                                                                                              |
| `packages/db/**`, any `repository.ts` | [database](./docs/coding-guidelines/database.md)                                                                                                                                            |
| `packages/auth/**`                    | [auth](./docs/coding-guidelines/auth.md)                                                                                                                                                    |
| `packages/contracts/**`               | [validation](./docs/coding-guidelines/validation.md)                                                                                                                                        |
| any `.ts`/`.tsx`                      | [typescript](./docs/coding-guidelines/typescript.md)                                                                                                                                        |
| `**/tests/**`, `e2e/**`               | [testing](./docs/coding-guidelines/testing.md)                                                                                                                                              |
| deps / workspace / build              | [monorepo](./docs/coding-guidelines/monorepo.md)                                                                                                                                            |

Each rule file states its scope (and a glob) at the top — see [`docs/coding-guidelines/README.md`](./docs/coding-guidelines/README.md).

## ReUI for Codex

The repository includes the official ReUI skill at
[`.agents/skills/reui/SKILL.md`](.agents/skills/reui/SKILL.md) and a project-scoped
MCP entry in [`.codex/config.toml`](.codex/config.toml). For ReUI work, read the
skill alongside the applicable rules above. Repository conventions take
precedence: use `pnpm dlx shadcn@latest` for CLI commands and install UI items from
`apps/web`, using its existing `components.json` aliases into `@repo/ui`.

Run `codex mcp login reui` from the repository root to sign in, then restart Codex
to load the MCP connection. Credentials stay outside the repository. See the
[ReUI Codex guide](https://reui.io/docs/codex) for authentication and skill updates;
keep updates scoped to this repo's `.agents/skills/reui` and `.codex/config.toml`.

## Project shape

Modular-monolith API (Hono) + Next.js 16 web + BullMQ worker, in a pnpm + Turborepo
monorepo. Per API module, dependencies flow one way:
`routes.ts` (only Hono) → `service.ts` (no Hono, no Drizzle) → `repository.ts` (only Drizzle).
Reference implementation: `apps/api/src/modules/projects/`.

## Commands

```bash
pnpm install                 # install (pnpm workspace)
pnpm dev                     # run api(:8008) + web(:3000) + worker
pnpm build                   # build all (api/worker → tsup dist, web → .next)
pnpm typecheck               # tsc --noEmit across workspace
pnpm lint                    # eslint across workspace
pnpm test | test:e2e         # Vitest (unit+integration) | Playwright
pnpm db:generate|migrate|studio
pnpm infra:up|down           # Postgres + Redis via docker compose
pnpm --filter @repo/<x> <script>   # target one package/app
```

Ordinary development uses API port 8008; the isolated E2E launcher uses 3001.
See [testing](./docs/guides/testing.md) for test targets and setup.

Before declaring done: `pnpm typecheck && pnpm lint && pnpm test` must pass.

## Sources

- Hono: [zod-openapi](https://hono.dev/examples/zod-openapi), [RPC](https://hono.dev/docs/guides/rpc)
- Drizzle: [PostgreSQL best practices](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717), [migrations](https://orm.drizzle.team/docs/migrations)
- better-auth: [best-practices skill](https://github.com/better-auth/skills/blob/main/better-auth/best-practices/SKILL.md), [security](https://better-auth.com/docs/reference/security), [sessions](https://better-auth.com/docs/concepts/session-management)
- Zod v4: [basics](https://zod.dev/basics), [api](https://zod.dev/api)
- BullMQ: [going to production](https://docs.bullmq.io/guide/going-to-production), [retries](https://docs.bullmq.io/guide/retrying-failing-jobs), [concurrency](https://docs.bullmq.io/guide/workers/concurrency)
- Next.js 16: [server & client components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [fetching data](https://nextjs.org/docs/app/getting-started/fetching-data), [production checklist](https://nextjs.org/docs/app/guides/production-checklist)
- Turborepo: [structuring a repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)
