# Adding a New API Module

This is the guide you'll use most. It walks through adding a domain module to the
API by copying the shape of `apps/api/src/modules/projects/`. We'll use a
hypothetical `leads` module as the example.

There are reserved (empty) folders for the planned domains:
`designers`, `media`, `leads`, `search`, `billing`, `reviews`, `bookings`,
`taxonomy`, `reports`. Each currently has a placeholder `index.ts`.

## The four steps

1. Define the schema (if the module owns tables) — `packages/db`.
2. Define the contracts (request/response shapes) — `packages/contracts`.
3. Build the module — `repository.ts` → `service.ts` → `routes.ts`.
4. Mount it in `apps/api/src/app.ts`.

Follow them bottom-up (data → contract → repo → service → route → mount).

---

## 1. Schema (`packages/db`)

Add tables to `packages/db/src/schema/domain.ts`. Use **camelCase** property keys;
the `casing: 'snake_case'` option maps them to snake_case columns automatically.

```ts
// packages/db/src/schema/domain.ts
export const leadStatusEnum = pgEnum('lead_status', [
  'new', 'reviewed', 'contacted', 'shared', 'closed', 'spam',
]);

export const lead = pgTable('lead', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => project.id, { onDelete: 'set null' }),
  status: leadStatusEnum('status').default('new').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

Then generate and apply a migration:

```bash
pnpm db:generate    # writes a new file in packages/db/migrations/
pnpm db:migrate
```

See [database-and-migrations.md](./database-and-migrations.md) for details.

---

## 2. Contracts (`packages/contracts`)

Create `packages/contracts/src/leads.ts` with **plain Zod** schemas (no framework
imports — the web app imports these too). Use `.meta({ id })` so the schema gets a
clean name in the OpenAPI spec.

```ts
// packages/contracts/src/leads.ts
import { z } from 'zod';

export const leadStatus = z.enum([
  'new', 'reviewed', 'contacted', 'shared', 'closed', 'spam',
]);

export const createLeadSchema = z
  .object({
    projectId: z.uuid().optional(),
    name: z.string().min(2).max(120),
    phone: z.string().min(6).max(20).optional(),
  })
  .meta({ id: 'CreateLead' });
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const leadResponseSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid().nullable(),
    status: leadStatus,
    name: z.string(),
    phone: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .meta({ id: 'Lead' });
export type LeadResponse = z.infer<typeof leadResponseSchema>;
```

Export it from the barrel:

```ts
// packages/contracts/src/index.ts
export * from './leads.js';
```

---

## 3a. Repository — the only Drizzle layer

```ts
// apps/api/src/modules/leads/repository.ts
import { db, schema, eq, desc } from '@repo/db';
import type { CreateLeadInput } from '@repo/contracts';

export type LeadRecord = typeof schema.lead.$inferSelect;

export const leadsRepository = {
  async list(limit: number, offset: number): Promise<LeadRecord[]> {
    return db.select().from(schema.lead)
      .orderBy(desc(schema.lead.createdAt))
      .limit(limit).offset(offset);
  },

  async create(input: CreateLeadInput): Promise<LeadRecord> {
    const [row] = await db.insert(schema.lead).values({
      projectId: input.projectId ?? null,
      name: input.name,
      phone: input.phone ?? null,
    }).returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  },
};
```

## 3b. Service — pure logic, no Hono, no Drizzle

```ts
// apps/api/src/modules/leads/service.ts
import type { CreateLeadInput, LeadResponse } from '@repo/contracts';
import { leadsRepository, type LeadRecord } from './repository.js';

function toResponse(row: LeadRecord): LeadResponse {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    name: row.name,
    phone: row.phone,
    createdAt: row.createdAt.toISOString(), // Date → ISO at the boundary
  };
}

export const leadsService = {
  async list(limit: number, offset: number): Promise<LeadResponse[]> {
    const rows = await leadsRepository.list(limit, offset);
    return rows.map(toResponse);
  },
  async create(input: CreateLeadInput): Promise<LeadResponse> {
    // ...business rules (dedup, scoring, etc.) go here...
    return toResponse(await leadsRepository.create(input));
  },
};
```

For domain failures, `throw AppError.notFound(...)` / `AppError.badRequest(...)`
from `apps/api/src/lib/errors.ts` — the central error handler maps them to the
right HTTP status and error envelope.

## 3c. Routes — the only Hono layer

```ts
// apps/api/src/modules/leads/routes.ts
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { createLeadSchema, leadResponseSchema, errorResponseSchema } from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { leadsService } from './service.js';

const createLeadRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Leads'],
  summary: 'Submit a lead',
  // Attach guards via the route's `middleware` field — NOT a chained .use(),
  // which would downgrade OpenAPIHono and lose .openapi() typing.
  middleware: [requireAuth] as const,
  security: [{ cookieAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createLeadSchema } } } },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: leadResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: errorResponseSchema } } },
  },
});

export const leadsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(createLeadRoute, async (c) => {
    const lead = await leadsService.create(c.req.valid('json'));
    return c.json(lead, 201);
  });

export type LeadsRoutes = typeof leadsRoutes;
```

> **Gotcha:** to require auth on a route, use the route's `middleware: [requireAuth]`
> field. Do **not** chain `.use(path, requireAuth)` between `.openapi()` calls —
> `.use()` returns a plain `Hono`, which loses the `.openapi()` method and breaks
> the type chain. (We hit this; see [troubleshooting.md](./troubleshooting.md).)

---

## 4. Mount it

In `apps/api/src/app.ts`, add one `.route()` to the chain. **Keep it in the chain
assigned to `routes`** — that's what `AppType` (and therefore the web client) is
derived from.

```ts
import { leadsRoutes } from './modules/leads/routes.js';

const routes = app
  .route('/api/projects', projectsRoutes)
  .route('/api/leads', leadsRoutes)        // ← add here
  .get('/health', (c) => c.json({ status: 'ok', service: 'homefolio-api' }));
```

That's it. The new endpoints are live, appear in `/docs`, and are callable from
the web app via `api.api.leads.$post(...)` with full type safety — no codegen.

---

## 5. Tests (TDD — write these alongside, ideally first)

Mirror the projects module (see [testing.md](./testing.md)):

- `tests/modules/leads/service.test.ts` — **unit**, `vi.mock` the repository; cover
  the business rules and error paths (`AppError`). No DB.
- `tests/modules/leads/routes.integration.test.ts` — **integration** via
  `testClient(app)` + test DB: happy path, validation (422), the `401` guard, and
  the authed path with `createAuthedSession()`.

## Checklist before you open a PR

- [ ] `repository.ts` is the only file importing `@repo/db`.
- [ ] `service.ts` imports neither `hono` nor `drizzle-orm`/`@repo/db`.
- [ ] Request/response shapes live in `@repo/contracts`, not inline in routes.
- [ ] Domain errors use `AppError`, not ad-hoc `c.json(..., 4xx)`.
- [ ] Migration generated **and** committed (`packages/db/migrations/`).
- [ ] **`service.test.ts` + `routes.integration.test.ts` added; `pnpm test` green.**
- [ ] `pnpm typecheck && pnpm lint` pass.
- [ ] New route shows up correctly at `/docs`.
