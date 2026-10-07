# Coding guidelines

These are enforced, tool-agnostic engineering conventions for Tickif. They are
the single source of truth for coding standards; load only the scoped documents
needed for a task after reading the universal rules. The common entry point is
[AGENTS.md](../../AGENTS.md).

At the start of every job, also read the [architecture overview](../architecture/overview.md)
and [ADR index](../adr/README.md), then the domain architecture and decisions that
apply. Guidelines define how to implement; architecture explains the current
system, and ADRs preserve why decisions were made.

| File                                       | Load when touching…                             | Scope (glob)                                                     |
| ------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------- |
| [golden-rules.md](./golden-rules.md)       | **Always**                                      | `**`                                                             |
| [security.md](./security.md)               | **Always**                                      | `**`                                                             |
| [typescript.md](./typescript.md)           | TypeScript                                      | `**/*.ts`, `**/*.tsx`                                            |
| [api.md](./api.md)                         | Backend routes and services                     | `apps/api/**`                                                    |
| [validation.md](./validation.md)           | Shared contracts and external input             | `packages/contracts/**`, validation boundaries                   |
| [database.md](./database.md)               | Schemas, migrations and repositories            | `packages/db/**`, repository files                               |
| [auth.md](./auth.md)                       | Login, sessions, RBAC and route guards          | `packages/auth/**`, protected routes                             |
| [background-jobs.md](./background-jobs.md) | Queues and workers                              | `apps/worker/**`                                                 |
| [frontend.md](./frontend.md)               | Web app and design system                       | `apps/web/**`, `packages/ui/**`                                  |
| [monorepo.md](./monorepo.md)               | Dependencies, workspace and build configuration | root config, `package.json`, `turbo.json`, `pnpm-workspace.yaml` |
| [testing.md](./testing.md)                 | Tests and TDD                                   | `**/tests/**`, `**/*.test.*`, `e2e/**`                           |

## Examples and workflows

- Package management, version catalogs, formatting and commits:
  [monorepo guidelines](./monorepo.md).
- Domain errors: [API guidelines](./api.md).
- Types and naming: [TypeScript guidelines](./typescript.md).
- Module construction: [adding a module](../guides/adding-a-module.md).
- Schema changes and migration warnings:
  [database and migrations](../guides/database-and-migrations.md).
- Test setup, examples and isolated targets: [testing guide](../guides/testing.md).

Keep examples alongside the applicable rule or workflow. Do not create another
copy of these standards in an editor-specific rule file.
