# Tickif — Engineering docs

Start with [the architecture overview](./architecture/overview.md), then read the
[ADR index](./adr/README.md) and decisions relevant to your task. Apply the
[coding guidelines](./coding-guidelines/README.md) when making changes.
AI coding agents follow [AGENTS.md](../AGENTS.md) at the start of every new job.

| Area                                               | Purpose                                                       |
| -------------------------------------------------- | ------------------------------------------------------------- |
| [Architecture](./architecture/README.md)           | Current system boundaries, data models and domain behavior    |
| [Coding guidelines](./coding-guidelines/README.md) | Enforced conventions, with universal and file-scoped rules    |
| [ADRs](./adr/README.md)                            | Architectural and product decisions, context and consequences |
| [Guides](./guides/README.md)                       | Setup and development workflows                               |
| [Runbooks](./runbooks/README.md)                   | Deployment, diagnosis, recovery and operator validation       |

## Local setup

Use Node >=22.13.0, the pinned pnpm 10.33.0 and Docker. Follow
[getting started](./guides/getting-started.md) for configuration and storage setup.

```bash
pnpm install --frozen-lockfile
cp .env.example .env          # set BETTER_AUTH_SECRET
pnpm infra:up
pnpm db:migrate
pnpm dev                      # API :8008, web :3000, worker
```

The API serves [Scalar](http://localhost:8008/docs) and
[OpenAPI](http://localhost:8008/openapi.json). The isolated E2E launcher uses
API port 3001; see [testing](./guides/testing.md) before running test suites.

## Documentation ownership

Keep architecture descriptive of the implementation, coding guidelines normative,
ADRs explicit about decisions and their history, and guides/runbooks procedural.
Update the relevant documents in the same change as implementation changes.
Keep reusable package and infrastructure instructions in their local READMEs.

Commit media only when a maintained document or the application references it.
Generated screenshots, recordings, traces and reports belong in ignored output
directories and CI artifacts. Commercial proposals stay outside the repository.
