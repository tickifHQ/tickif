import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './visual',
  testMatch: 'logo-display.spec.ts',
  workers: 1,
  globalTeardown: './scripts/logo-evidence-cleanup.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: '../test-results/logo-evidence',
  use: { baseURL: 'http://localhost:3108', video: 'on', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm exec tsx scripts/logo-evidence-server.ts',
    url: 'http://localhost:3108/logo-display-evidence',
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
