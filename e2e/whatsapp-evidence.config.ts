import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Real browser/app journeys; only external provider boundaries use fixtures. */
export default defineConfig({
  ...base,
  testMatch: ['authentication.spec.ts', 'whatsapp-verification.spec.ts'],
  grep: /phone OTP creates a visitor session|email OTP creates a real session|individual onboarding cannot skip WhatsApp verification|personal WhatsApp changes require OTP|company onboarding and profile contact replacement/,
  outputDir: '../test-results/whatsapp-ui',
  reporter: [
    ['list'],
    ['json', { outputFile: '../test-results/whatsapp-ui-results.json' }],
    ['html', { outputFolder: '../test-results/whatsapp-ui-report', open: 'never' }],
  ],
  use: {
    ...base.use,
    viewport: { width: 1440, height: 1000 },
    video: { mode: 'on', size: { width: 1440, height: 1000 } },
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
});
