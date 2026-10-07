# Development guides

These documents explain how to work on Tickif. Before implementation, follow
[AGENTS.md](../../AGENTS.md) and load the relevant
[architecture](../architecture/README.md), [ADRs](../adr/README.md) and
[coding guidelines](../coding-guidelines/README.md).

| Guide                                                   | Purpose                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| [Getting started](./getting-started.md)                 | Dependencies, local environment, services and smoke checks        |
| [Adding a module](./adding-a-module.md)                 | Schema, contracts, repository, service, routes and tests          |
| [Database and migrations](./database-and-migrations.md) | Schema-change workflow, migration warnings and repository queries |
| [Testing](./testing.md)                                 | Vitest, isolated integration targets and Playwright               |
| [Troubleshooting](./troubleshooting.md)                 | Configuration, dependencies, framework typing and builds          |

The [critical E2E journeys](../../e2e/critical-journeys.md) and
[verification lifecycle check](../../e2e/verification-lifecycle.md) remain beside
their harness. Use [runbooks](../runbooks/README.md) for deployment and recovery.
