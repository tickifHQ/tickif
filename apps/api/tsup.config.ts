import { defineConfig } from 'tsup';

// Inline only the workspace (@repo/*) packages; keep npm deps external (they
// resolve from node_modules at runtime). This avoids fragile full-bundling of
// libraries like better-auth, while still producing a runnable `dist` because
// the @repo/* source — which pnpm would otherwise leave as unbuilt .ts — is
// compiled in. Runtime npm deps used transitively (better-auth, drizzle-orm,
// pg, dotenv) are declared as direct deps of this app so they resolve here.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  bundle: true,
  noExternal: [/^@repo\//],
  clean: true,
  sourcemap: true,
});
