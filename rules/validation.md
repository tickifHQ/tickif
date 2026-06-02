# Validation (Zod v4 + @repo/contracts)

Scope: `packages/contracts/**`, plus anywhere shapes are validated.

- **Contracts are the single source of truth.** Request/response shapes live as
  Zod schemas in `@repo/contracts`; import them in both api and web. Never inline
  or re-declare a shape.
- `@repo/contracts` stays **framework-free** (plain `zod` only) so the web app can
  import it without pulling in server code.
- **Define schemas at module level**, never inside a function (2–5× faster on
  repeated validation).
- Use **`safeParse`** in application code (structured errors, faster on invalid
  input); reserve `parse` for places where throwing is intended.
- Tag every exported schema with `.meta({ id: 'Name' })` for clean OpenAPI
  component names.
- Use `z.coerce.*` for query/param inputs (everything arrives as strings).
- Use `z.discriminatedUnion('type', [...])` for tagged unions (O(1) dispatch).
- `z.uuid()` is strict (RFC variant). Use real UUIDs in fixtures.

## Don't

- ❌ Inline a shape in a route or duplicate it in the web app.
- ❌ Add framework imports to `@repo/contracts`.
- ❌ Define schemas inside hot-path functions.
