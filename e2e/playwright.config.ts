import { defineConfig } from '@playwright/test';
import { apiUrl, webUrl, providerUrl, environment } from './lib/environment';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '../test-results/e2e-results.json' }]],
  outputDir: '../test-results/e2e',
  use: { baseURL: webUrl, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  globalSetup: './scripts/readiness.ts',
  webServer: {
    command: 'pnpm stack',
    url: webUrl,
    reuseExistingServer: false,
    // Cold Next compilation + guarded migration/seed/bootstrap can take minutes on a shared host.
    // Assertions keep the ordinary 10s deadline; this allowance applies only to stack startup.
    timeout: 300_000,
    env: environment,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
  },
  metadata: { apiUrl, providerUrl },
});
