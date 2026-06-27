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

## Status

- ✅ `projects` — fully implemented reference slice (route → service → repo → Drizzle).
- ✅ `dashboard` — overview aggregate for designer dashboard onboarding/status.
- ⬜ `designers`, `leads`, `search`, `billing`, `reviews`, `bookings`,
  `reports` — folders reserved; built in later phases per the
  Tickif blueprint.
