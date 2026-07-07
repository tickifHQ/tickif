const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const DEV_LOG = path.join(__dirname, '..', 'demo', 'worker-dev.log');
const OUT_DIR = path.join(__dirname, '..', 'demo', 'home-states');
const PHONE_DIGITS = '9876543210';
const NORMALIZED_PHONE = '91' + PHONE_DIGITS;

fs.mkdirSync(OUT_DIR, { recursive: true });

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function readOtpFromLog(phone) {
  const buf = fs.readFileSync(DEV_LOG); const content = buf.includes(0) ? buf.toString('utf16le') : buf.toString('utf8');
  const regex = new RegExp(`OTP for ${phone}: (\\d{6})`, 'g');
  let match;
  let last = null;
  while ((match = regex.exec(content))) last = match;
  return last ? last[1] : null;
}

async function waitForOtp(phone, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const otp = readOtpFromLog(phone);
    if (otp) return otp;
    await pause(500);
  }
  throw new Error('Timed out waiting for OTP in dev log');
}

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

  // --- login via OTP ---
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('text=Login to continue');
  await page.getByLabel('Phone number').click();
  await page.getByLabel('Phone number').pressSequentially(PHONE_DIGITS, { delay: 40 });
  await page.getByRole('button', { name: 'Get OTP' }).click();
  await page.waitForSelector('text=Enter verification code', { timeout: 15000 });
  const otp = await waitForOtp(NORMALIZED_PHONE);
  console.log('got OTP', otp);
  for (let i = 0; i < 6; i++) {
    await page.getByLabel(`OTP digit ${i + 1}`).fill(otp[i]);
    await pause(80);
  }
  await page.getByRole('button', { name: 'Continue' }).click({ timeout: 3000 }).catch(() => {});
  await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 });
  await page.waitForLoadState('networkidle').catch(() => {});
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



