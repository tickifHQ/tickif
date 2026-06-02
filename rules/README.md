# Rules

Modular, tool-agnostic engineering rules for Tickif. Each file is a focused
topic so an AI agent (or human) can **load only what's relevant** to the files
being edited. The entry point is [`../AGENTS.md`](../AGENTS.md).

| File | Load when you're touching… | Scope (glob) |
| --- | --- | --- |
| [golden-rules.md](./golden-rules.md) | **always** | `**` |
| [typescript.md](./typescript.md) | any TypeScript | `**/*.ts`, `**/*.tsx` |
| [api.md](./api.md) | the backend API | `apps/api/**` |
| [validation.md](./validation.md) | request/response shapes, schemas | `packages/contracts/**` |
| [database.md](./database.md) | schema, migrations, repositories | `packages/db/**`, `**/repository.ts` |
| [auth.md](./auth.md) | login, sessions, RBAC, route guards | `packages/auth/**` |
| [background-jobs.md](./background-jobs.md) | queues / workers | `apps/worker/**` |
| [frontend.md](./frontend.md) | the web app | `apps/web/**` |
| [monorepo.md](./monorepo.md) | deps, workspace, build config | root, `package.json`, `turbo.json` |
| [security.md](./security.md) | **always** | `**` |
| [testing.md](./testing.md) | tests / TDD | `**/tests/**`, `**/*.test.*`, `e2e/**` |

**Single source of truth:** every AI agent (Claude Code, Cursor, Copilot, Codex, …)
reads [`AGENTS.md`](../AGENTS.md) + these files — there are no tool-specific rule
copies to keep in sync. The glob column above tells an agent which file(s) apply to
the code it's editing.

Full prose explanations live in [`../docs/`](../docs/README.md).
