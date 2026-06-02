import { desc } from 'drizzle-orm';
import { db, schema } from '@repo/db';
import { auth } from '@repo/auth';

/**
 * Mints a real authenticated session by driving the actual phone-OTP flow
 * against the test DB, then returns a `Cookie` header value usable on requests.
 *
 * We read the OTP from the `verification` table (the dev sender only logs it).
 * The resulting session is real — it verifies under the same secret the app uses.
 */
export async function createAuthedSession(
  phoneNumber = '+919800000001',
): Promise<{ cookie: string; phoneNumber: string }> {
  await auth.api.sendPhoneNumberOTP({ body: { phoneNumber } });

  const [verification] = await db
    .select()
    .from(schema.verification)
    .orderBy(desc(schema.verification.createdAt))
    .limit(1);

  const code = verification?.value.match(/\d{4,8}/)?.[0];
  if (!code) {
    throw new Error('createAuthedSession: could not read OTP from verification table');
  }

  const res = await auth.api.verifyPhoneNumber({
    body: { phoneNumber, code },
    asResponse: true,
  });

  const setCookies = res.headers.getSetCookie();
  if (setCookies.length === 0) {
    throw new Error('createAuthedSession: verify did not return a session cookie');
  }
  // Convert Set-Cookie entries into a single Cookie request header.
  const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  return { cookie, phoneNumber };
}
