# Conventions

Shared standards so the codebase stays consistent as the team grows.

## Package manager: pnpm only

This is a pnpm workspace. Use `pnpm`, never `npm`/`yarn`. Adding a dep:

```bash
pnpm --filter @repo/api add some-pkg          # runtime dep of the api app
pnpm --filter @repo/db add -D some-tool        # dev dep of the db package
pnpm add -Dw some-tool                         # dev dep at the workspace root
```

## Dependency versions: the catalog

Shared dependency versions are centralized in the **catalog** in
`pnpm-workspace.yaml`. Reference them in `package.json` as:

```jsonc
{ "dependencies": { "zod": "catalog:", "hono": "catalog:" } }
```

When bumping a shared dep, change it **once** in the catalog. Add a new entry to
the catalog when more than one package will use the dep. One-off deps can be
pinned directly. This keeps versions aligned across apps and avoids duplicate
installs (which can cause real bugs — see the ioredis story in
[troubleshooting.md](./troubleshooting.md)).

## Internal packages

- Named `@repo/*`, referenced as `"@repo/x": "workspace:*"`.
- They **export TypeScript source directly** (their `exports` point at `.ts`).
  This is great for DX: dev (tsx), Next.js (`transpilePackages`), and typecheck
  all read source — no build step needed for packages during development.
- The Node apps (`api`, `worker`) are **bundled with tsup** for production, which
  inlines the `@repo/*` source. The web app uses `transpilePackages`.

## The layering rule

The single most important convention. Inside an API module:

- `routes.ts` — only file importing Hono.
- `service.ts` — imports neither Hono nor Drizzle.
- `repository.ts` — only file importing Drizzle (`@repo/db`).

Reviewers should reject PRs that violate this. See [architecture.md](./architecture.md).

## Contracts are the source of truth

Request/response shapes live in `@repo/contracts` as Zod schemas, not inline in
routes and not duplicated in the web app. Both sides import the same schema.

- Use `.meta({ id: 'Name' })` so the schema is named in the OpenAPI output.
- Keep `@repo/contracts` free of framework imports (plain `zod` only) so the web
  app can import it without pulling in server code.

## Configuration

Never read `process.env` directly. Add the variable to:

1. the Zod schema in `packages/config/src/index.ts`,
2. `.env.example` (documented, with a safe placeholder),

then import the typed value from `@repo/config`. Missing/invalid env fails fast
at boot with a readable message. Secrets never get committed (`.env` is gitignored).

## Errors

In services, throw `AppError` (`apps/api/src/lib/errors.ts`):

```ts
throw AppError.notFound('Project not found');
throw AppError.badRequest('citySlug is required');
```

The central `onError` handler maps these to the right status and the standard
error envelope (`{ error: { code, message, details } }`). Don't scatter
`c.json({...}, 4xx)` for domain errors.

## TypeScript

- Strict mode is on (plus `noUncheckedIndexedAccess`) via `@repo/tsconfig`.
- Extend the right base: `@repo/tsconfig/node.json` for Node packages,
  `@repo/tsconfig/nextjs.json` for the web app.
- Prefer `import type { ... }` for type-only imports (lint enforces this).

## Formatting & linting

- **Prettier** for formatting (`pnpm format`). Config in `.prettierrc.json`.
- **ESLint** flat config shared from `@repo/eslint-config/base`.
- Run `pnpm typecheck && pnpm lint` before pushing; both run in CI.

## Naming

- Packages/apps: `@repo/<name>`, kebab folder names.
- DB: camelCase in TS, snake_case columns (casing option handles the mapping).
- Files: `routes.ts` / `service.ts` / `repository.ts` per module — don't invent
  new names for these layers.

## Commits / branches

Branch off the default branch; don't commit directly to it. Keep migrations in
the same commit/PR as the schema change that produced them.
