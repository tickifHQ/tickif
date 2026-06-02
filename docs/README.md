# Homefolio — Engineering Docs

Onboarding and reference docs for the Homefolio platform. Start at the top and
work down; the first two get you running, the rest are reference.

| Doc | Read it when |
| --- | --- |
| [getting-started.md](./getting-started.md) | Day one. Get the stack running locally. |
| [architecture.md](./architecture.md) | You want the mental model — monorepo layout, the modular monolith, the layering rule. |
| [adding-a-module.md](./adding-a-module.md) | You're about to build a new domain (leads, media, search…). The most-used guide. |
| [database-and-migrations.md](./database-and-migrations.md) | You're changing the schema or running migrations. |
| [auth.md](./auth.md) | You're protecting a route, working on login, or touching RBAC. |
| [conventions.md](./conventions.md) | Anytime — coding standards, env config, shared contracts. |
| [troubleshooting.md](./troubleshooting.md) | Something broke, or you hit a pnpm/build oddity. |

## TL;DR

```bash
# prerequisites: Node >= 20, pnpm >= 10, Docker
pnpm install
cp .env.example .env          # then set BETTER_AUTH_SECRET (see getting-started)
pnpm infra:up                 # Postgres + Redis in Docker
pnpm db:migrate               # apply schema
pnpm dev                      # api :3001, web :3000, worker
```

- Web: <http://localhost:3000>
- API docs (Scalar): <http://localhost:3001/docs>
- OpenAPI spec: <http://localhost:3001/openapi.json>

## The one rule to internalize

Inside every API module, dependencies flow one direction only:

```
routes (Hono)  →  service (pure logic)  →  repository (Drizzle)
```

- **routes** are the only files that import Hono.
- **services** import neither Hono nor Drizzle.
- **repositories** are the only files that import Drizzle.

See [architecture.md](./architecture.md) for why, and
[adding-a-module.md](./adding-a-module.md) for how.
