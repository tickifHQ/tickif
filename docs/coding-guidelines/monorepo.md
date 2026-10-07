# Monorepo (Turborepo + pnpm)

Scope: root config, `package.json` files, `turbo.json`, `pnpm-workspace.yaml`.

- **pnpm only** — never `npm`/`yarn`.
- Root `package.json` is `private`, pins `packageManager`, and delegates scripts
  to `turbo run`. Don't add app logic to root scripts.
- Internal packages are `@repo/*`, referenced `"workspace:*"`, and export via
  their `exports` map. Don't deep-import a package's internal files.
- Bump shared deps in the **catalog** (`pnpm-workspace.yaml`) once. Add a catalog
  entry when 2+ packages share a dep. Watch for duplicate versions
  (`pnpm why <pkg> -r`) — duplicates cause real type/runtime bugs.
- api/worker build with **tsup** (inline `@repo/*`, keep npm deps external).
  Runtime deps used transitively must be **direct deps** of the app so they
  resolve under pnpm's isolated layout.

## Don't

- ❌ `npm install` / `yarn`.
- ❌ Inline-pin a dependency that belongs in the catalog.
- ❌ Deep-import another package's internal files (use its `exports`).

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
[troubleshooting.md](../guides/troubleshooting.md)).

## Internal packages

- Named `@repo/*`, referenced as `"@repo/x": "workspace:*"`.
- They **export TypeScript source directly** (their `exports` point at `.ts`).
  This is great for DX: dev (tsx), Next.js (`transpilePackages`), and typecheck
  all read source — no build step needed for packages during development.
- The Node apps (`api`, `worker`) are **bundled with tsup** for production, which
  inlines the `@repo/*` source. The web app uses `transpilePackages`.

## Formatting & linting

- **Prettier** for formatting (`pnpm format`). Config in `.prettierrc.json`.
- **ESLint** flat config shared from `@repo/eslint-config/base`.
- Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build` before pushing;
  these checks also run in CI.

## Commits / branches

Branch off the default branch; don't commit directly to it. Keep migrations in
the same commit/PR as the schema change that produced them.
