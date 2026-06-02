# Frontend (Next.js 16 + Tailwind v4)

Scope: `apps/web/**`.

- Default to **Server Components**; fetch data on the server. Add `'use client'`
  only at the leaves that truly need interactivity, and pass server data down as
  props.
- `params` and `searchParams` are **Promises** in Next 16 — `await` them.
- Prefer static rendering; use `export const dynamic = 'force-dynamic'` only when
  the page genuinely needs per-request freshness.
- Wrap slow data in `<Suspense>` for streaming. Use `React.cache` to dedupe
  identical fetches within a render.
- Call the API through the typed `hc` client (`apps/web/src/lib/api.ts`), not
  hand-written `fetch` with stringly-typed URLs.
- Use shared types from `@repo/contracts` for props/data shapes.

## Don't

- ❌ Mark a component `'use client'` just to fetch data.
- ❌ Call the API with stringly-typed `fetch` URLs instead of `hc`.
