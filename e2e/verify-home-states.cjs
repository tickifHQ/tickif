const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pause, loginViaOtp } = require('./lib/otp-login.cjs');

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, '..', 'demo', 'home-states');

fs.mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1512, height: 900 } });
  const page = await context.newPage();

  // --- logged-out home ---
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle').catch(() => {});
  await pause(2500);
  await page.screenshot({ path: path.join(OUT_DIR, 'logged-out.png'), fullPage: true });
  console.log('captured logged-out');

  await loginViaOtp(page, BASE_URL);
  await pause(2500);

  // --- logged-in home ---
  await page.screenshot({ path: path.join(OUT_DIR, 'logged-in.png'), fullPage: true });
  console.log('captured logged-in');

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
