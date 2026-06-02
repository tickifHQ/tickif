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
