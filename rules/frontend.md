# Frontend (Next.js 16 + Tailwind v4)

Scope: `apps/web/**`, `packages/ui/**`.

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

## Components & design system

- **Reuse before you build.** Check `packages/ui/src/components/` (then
  `apps/web/src/components/`) for an existing component before writing a new
  one. Extend via props or `cva` variants instead of duplicating. The live
  inventory is at `/design-system` in the web app.
- **Reusable components live in `@repo/ui`** (`packages/ui`): primitives and
  generic building blocks (buttons, inputs, overlays, badges, …). Only
  app-specific compositions (e.g. `project-card`) belong in
  `apps/web/src/components/`.
- **Style with semantic tokens only** — `bg-primary`, `text-muted-foreground`,
  `rounded-lg`, `font-display`. Theme values live in
  `packages/ui/src/styles/themes/`; see `packages/ui/README.md`.
- Missing shadcn primitives: generate with `pnpm dlx shadcn@latest add <name>`
  (`components.json` routes output into `packages/ui`), then restyle with
  tokens if needed.

## Don't

- ❌ Mark a component `'use client'` just to fetch data.
- ❌ Call the API with stringly-typed `fetch` URLs instead of `hc`.
- ❌ Create a component that already exists in `@repo/ui`, or put a reusable
  one in `apps/web`.
- ❌ Hardcode colors, fonts, or radii (`bg-neutral-50`, `text-amber-800`,
  hex values) — use semantic tokens.
