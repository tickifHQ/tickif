const { chromium } = require('@playwright/test');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, '..', 'demo', 'pr-media');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1512, height: 900 } });
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle').catch(() => {});
  const filtersBtn = page.getByRole('button', { name: 'Filters' });
  await filtersBtn.scrollIntoViewIfNeeded();
  await pause(1200);

  // scroll the chips strip to the end — the Filters button and divider must stay put
  const chips = page.locator('div.overflow-x-auto', { has: page.getByRole('button', { name: 'All' }) }).first();
  await chips.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await pause(600);

  const box = await filtersBtn.boundingBox();
  const y = Math.max(0, box.y - 60);
  await page.screenshot({ path: path.join(OUT_DIR, '07-filters-scrolled.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y, width: 1512, height: 220 } });
  console.log('captured 07-filters-scrolled');

  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
