const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pause, loginViaOtp } = require('./lib/otp-login.cjs');

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, '..', 'demo', 'pr-media');

fs.mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name, clip) {
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}.jpg`),
    type: 'jpeg',
    quality: 82,
    clip,
  });
  console.log('captured', name);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1512, height: 900 } });
  const page = await context.newPage();

  // --- logged out ---
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle').catch(() => {});
  await pause(2000);
  await shot(page, '01-logged-out-hero');

  await page.getByRole('heading', { name: 'Trending projects' }).scrollIntoViewIfNeeded();
  await pause(1500);
  await shot(page, '02-logged-out-feed');

  // hover a card to show the overlay treatment
  const card = page.locator('article').nth(1);
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await pause(600);
  await shot(page, '03-logged-out-card-hover');

  // filters row scrolled to the end — Filters button and divider stay pinned
  const filtersBtn = page.getByRole('button', { name: 'Filters' });
  await filtersBtn.scrollIntoViewIfNeeded();
  const chips = page
    .locator('div.overflow-x-auto', { has: page.getByRole('button', { name: 'All' }) })
    .first();
  await chips.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await pause(600);
  const box = await filtersBtn.boundingBox();
  if (box) {
    await shot(page, '07-filters-scrolled', {
      x: 0,
      y: Math.max(0, box.y - 60),
      width: 1512,
      height: 220,
    });
  } else {
    console.warn('skipped 07-filters-scrolled: Filters button not visible');
  }
  await chips.evaluate((el) => {
    el.scrollLeft = 0;
  });

  // trigger the scroll gate (5 units x 400px of downward scroll)
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 400);
    await pause(150);
  }
  await pause(1000);
  await shot(page, '04-scroll-gate');

  await loginViaOtp(page, BASE_URL);
  await pause(2000);

  // --- logged in (search bar + feed with the Try-a-filter card share the first viewport) ---
  await shot(page, '05-logged-in-search');

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
