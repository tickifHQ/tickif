import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Shared Vitest base for React (Next.js) component tests. happy-dom + RTL.
 *
 *   import { reactPreset } from '@repo/vitest-config/react';
 *   export default reactPreset();
 *
 * Authored as plain ESM (.mjs) so it loads on the project's minimum Node (20),
 * which cannot import `.ts` natively. Types live in react.d.ts.
 */
export function reactPreset(overrides = {}) {
  return defineConfig({
    plugins: [react()],
    test: {
      globals: true,
      environment: 'happy-dom',
      include: ['tests/**/*.test.{ts,tsx}'],
      setupFiles: ['./tests/setup.ts'],
      coverage: {
        provider: 'v8',
        reportsDirectory: './coverage',
        include: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
      },
      ...overrides,
    },
  });
}
