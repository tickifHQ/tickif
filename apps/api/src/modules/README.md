# API Modules

Each domain is a self-contained module following the same three-layer shape and
dependency direction (enforced by convention + review):

```
routes.ts        # ONLY layer that imports Hono. Validates via @repo/contracts,
                 # delegates to the service. No business logic.
service.ts       # Use-cases / business logic. Imports the repository + contracts.
                 # Imports NEITHER Hono NOR Drizzle.
repository.ts    # ONLY layer that imports Drizzle (@repo/db). Returns
                 # framework-free records.
```

A module is mounted in `../app.ts` with a single `.route('/api/<name>', <name>Routes)`.

## Implemented modules and current scope

`projects` is the reference route/service/repository slice. Implemented modules
include profiles/portfolios, discovery/search, taxonomy, leads/enquiries, reviews,
billing, organization access/retention, verification, moderation and reporting.
Some modules provide internal services rather than a dedicated route surface.
Use [`app.ts`](../app.ts) for the actual mounted route inventory.

Booking code is retained, but scheduling remains disabled by default.
[ADR 0003](../../../../docs/adr/0003-consultation-enquiries.md) records the
current enquiry-based product decision. Before a new job, follow the
[root agent instructions](../../../../AGENTS.md) and load the applicable
[architecture](../../../../docs/architecture/README.md),
[ADRs](../../../../docs/adr/README.md) and
[coding guidelines](../../../../docs/coding-guidelines/README.md).
