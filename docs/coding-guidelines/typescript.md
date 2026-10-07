# TypeScript

Scope: all `.ts`/`.tsx`.

- Strict mode is on (`noUncheckedIndexedAccess` included). Honor it; don't widen
  types to silence errors.
- Use `import type { ... }` for type-only imports (lint enforces).
- Extend the right base config: `@repo/tsconfig/node.json` (Node) or
  `@repo/tsconfig/nextjs.json` (web). Don't write tsconfig compiler options ad hoc.
- Prefer inference from Drizzle (`typeof table.$inferSelect`) and Zod
  (`z.infer<>`) over hand-written duplicate types.

## Don't

- ❌ `any`, or `@ts-ignore` without an explanatory comment.
- ❌ Duplicate a type that can be inferred from a schema or table.

## Naming

- Packages/apps: `@repo/<name>`, kebab folder names.
- DB: camelCase in TS, snake_case columns (casing option handles the mapping).
- Files: `routes.ts` / `service.ts` / `repository.ts` per module. Larger modules may use descriptive filenames such as
  `subscribe-routes.ts`, `subscribe-service.ts` and `subscribe-repository.ts`
  while preserving the same dependency direction.
