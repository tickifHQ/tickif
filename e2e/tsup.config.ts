import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['scripts/start-api.ts', 'scripts/start-worker.ts'],
  format: ['esm'],
  target: 'node22',
  splitting: false,
  clean: true,
  noExternal: ['@repo/config'],
});
