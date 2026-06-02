import { defineConfig } from '@playwright/test';

const API_URL = 'http://localhost:3001';
const WEB_URL = 'http://localhost:3000';

// E2E points the stack at the test DB so it never touches dev data.
// Preconditions: `pnpm infra:up` and the test DB migrated.
const testDbUrl =
  process.env.DATABASE_URL_TEST ??
  'postgresql://tickif:tickif@localhost:5432/tickif_test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: WEB_URL, trace: 'on-first-retry' },
  webServer: [
    {
      command: 'pnpm --filter @repo/api dev',
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { DATABASE_URL: testDbUrl },
    },
    {
      command: 'pnpm --filter @repo/web dev',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { NEXT_PUBLIC_API_URL: API_URL },
    },
  ],
});
