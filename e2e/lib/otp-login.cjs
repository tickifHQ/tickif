const fs = require('fs');
const path = require('path');

// Worker dev log that echoes OTPs, e.g. "[sms] OTP for 91XXXXXXXXXX: 123456".
// Override with DEV_LOG_PATH; defaults to the local demo/ capture setup.
const DEV_LOG = process.env.DEV_LOG_PATH || path.join(__dirname, '..', '..', 'demo', 'worker-dev.log');

const PHONE_DIGITS = process.env.DEMO_PHONE || '9876543210';
const NORMALIZED_PHONE = '91' + PHONE_DIGITS;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function readOtpFromLog(phone) {
  if (!fs.existsSync(DEV_LOG)) {
    throw new Error(
      `Worker dev log not found at ${DEV_LOG}. Start the worker with output piped there, ` +
        'or set DEV_LOG_PATH to your worker log file.',
    );
  }
  const buf = fs.readFileSync(DEV_LOG);
  // PowerShell Tee-Object writes UTF-16; detect via NUL bytes.
  const content = buf.includes(0) ? buf.toString('utf16le') : buf.toString('utf8');
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

/** Drives the phone-OTP login flow; resolves once the app lands back on baseUrl. */
async function loginViaOtp(page, baseUrl) {
  await page.goto(`${baseUrl}/login`);
  await page.waitForSelector('text=Login to continue');
  await page.getByLabel('Phone number').click();
  await page.getByLabel('Phone number').pressSequentially(PHONE_DIGITS, { delay: 40 });
  await page.getByRole('button', { name: 'Get OTP' }).click();
  await page.waitForSelector('text=Enter verification code', { timeout: 15000 });
  const otp = await waitForOtp(NORMALIZED_PHONE);
  for (let i = 0; i < 6; i++) {
    await page.getByLabel(`OTP digit ${i + 1}`).fill(otp[i]);
    await pause(80);
  }
  await page.getByRole('button', { name: 'Continue' }).click({ timeout: 3000 }).catch(() => {});
  await page.waitForURL(`${baseUrl}/`, { timeout: 20000 });
  await page.waitForLoadState('networkidle').catch(() => {});
}

module.exports = { pause, waitForOtp, loginViaOtp, PHONE_DIGITS, NORMALIZED_PHONE };
