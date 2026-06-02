import react from '@vitejs/plugin-react';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

/**
 * Shared Vitest base for React (Next.js) component tests. happy-dom + RTL.
 *
 *   import { reactPreset } from '@repo/vitest-config/react';
 *   export default reactPreset();
 */
export function reactPreset(overrides: ViteUserConfig['test'] = {}): ViteUserConfig {
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
