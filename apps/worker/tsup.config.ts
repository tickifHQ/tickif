import { defineConfig } from 'tsup';

// Inline workspace (@repo/*) packages; keep npm deps (bullmq, dotenv) external
// so they resolve from node_modules at runtime. See apps/api/tsup.config.ts.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  bundle: true,
  noExternal: [/^@repo\//],
  clean: true,
  sourcemap: true,
});
