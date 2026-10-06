import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './visual',
  testMatch: 'scroll-gate.spec.ts',
  workers: 1,
  globalTeardown: './scripts/scroll-gate-evidence-cleanup.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: '../test-results/scroll-gate-evidence',
  use: { baseURL: 'http://localhost:3118', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm exec tsx scripts/scroll-gate-evidence-server.ts',
    url: 'http://localhost:3118/scroll-gate-evidence',
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
