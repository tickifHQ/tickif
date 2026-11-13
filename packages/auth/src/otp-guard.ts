import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { config } from '@repo/config';
import { and, db, eq, gt, lte, schema, sql } from '@repo/db';
import { bodyString } from './request-body.js';

/**
 * Login-code limits per phone number or email address. Every send is paid, and a
 * resend never resets the wrong-guess count: ten wrong guesses within a day lock the
 * identifier for an hour, and each further wrong guess that day locks it again.
 */
export const OTP_LIMITS = {
  sendCooldownSeconds: 60,
  sendsPerHour: 5,
  wrongGuessesPerDay: 10,
  lockoutSeconds: 60 * 60,
} as const;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type OtpAttempt = { kind: 'send' | 'wrong_guess'; createdAt: Date };
type OtpRoute = { channel: 'phone' | 'email'; step: 'send' | 'verify' };

const OTP_ROUTES = new Map<string, OtpRoute>([
  ['/phone-number/send-otp', { channel: 'phone', step: 'send' }],
  ['/phone-number/verify', { channel: 'phone', step: 'verify' }],
  ['/email-otp/send-verification-otp', { channel: 'email', step: 'send' }],
  ['/sign-in/email-otp', { channel: 'email', step: 'verify' }],
  ['/email-otp/check-verification-otp', { channel: 'email', step: 'verify' }],
  ['/email-otp/verify-email', { channel: 'email', step: 'verify' }],
]);

const WRONG_GUESS_CODES = new Set(['INVALID_OTP', 'TOO_MANY_ATTEMPTS']);

/** E.164 numbers in a configured calling code; calling codes are prefix-free. */
export function isAllowedPhoneNumber(phoneNumber: string): boolean {
  return (
    /^\+[1-9]\d{7,14}$/.test(phoneNumber) &&
    config.OTP_ALLOWED_COUNTRY_CODES.some((code) => phoneNumber.startsWith(`+${code}`))
  );
}

function waitText(seconds: number): string {
  if (seconds >= 120) return `${Math.ceil(seconds / 60)} minutes`;
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

function tooManyRequests(code: string, reason: string, until: number, now: Date): APIError {
  const seconds = Math.ceil((until - now.getTime()) / 1000);
  return new APIError(
    'TOO_MANY_REQUESTS',
    { code, message: `${reason} Try again in ${waitText(seconds)}.` },
    { 'Retry-After': String(seconds) },
  );
}

/** Why `step` must wait, given the identifier's attempts from the last 24 hours. */
export function otpRefusal(
  attempts: OtpAttempt[],
  step: OtpRoute['step'],
  now: Date,
): APIError | null {
  const ageOf = (attempt: OtpAttempt) => now.getTime() - attempt.createdAt.getTime();
  const wrongGuesses = attempts
    .filter((attempt) => attempt.kind === 'wrong_guess' && ageOf(attempt) < DAY_MS)
    .map((attempt) => attempt.createdAt.getTime());
  if (wrongGuesses.length >= OTP_LIMITS.wrongGuessesPerDay) {
    const lockedUntil = Math.max(...wrongGuesses) + OTP_LIMITS.lockoutSeconds * 1000;
    if (lockedUntil > now.getTime()) {
      return tooManyRequests('OTP_LOCKED', 'Too many incorrect codes.', lockedUntil, now);
    }
  }
  if (step === 'verify') return null;

  const sends = attempts
    .filter((attempt) => attempt.kind === 'send' && ageOf(attempt) < HOUR_MS)
    .map((attempt) => attempt.createdAt.getTime())
    .sort((a, b) => a - b);
  const cooldownEnd = (sends.at(-1) ?? 0) + OTP_LIMITS.sendCooldownSeconds * 1000;
  const oldestCountedSend = sends.at(-OTP_LIMITS.sendsPerHour);
  const hourlyEnd = oldestCountedSend === undefined ? 0 : oldestCountedSend + HOUR_MS;
  const nextSendAt = Math.max(cooldownEnd, hourlyEnd);
  return nextSendAt > now.getTime()
    ? tooManyRequests('OTP_SEND_LIMITED', 'Too many codes requested.', nextSendAt, now)
    : null;
}

type Executor = Pick<typeof db, 'select'>;

function recentAttempts(executor: Executor, identifier: string, now: Date) {
  return executor
    .select({ kind: schema.otpAttempt.kind, createdAt: schema.otpAttempt.createdAt })
    .from(schema.otpAttempt)
    .where(
      and(
        eq(schema.otpAttempt.identifier, identifier),
        gt(schema.otpAttempt.createdAt, new Date(now.getTime() - DAY_MS)),
      ),
    );
}

/** Checks and records a send in one serialized step, before any code is created or paid for. */
async function reserveSend(identifier: string, now: Date): Promise<void> {
  const refusal = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`otp:${identifier}`}, 0))`,
    );
    const attempts = await recentAttempts(tx, identifier, now);
    const tooSoon = otpRefusal(attempts, 'send', now);
    if (tooSoon) return tooSoon;
    await tx.insert(schema.otpAttempt).values({ identifier, kind: 'send', createdAt: now });
    await tx
      .delete(schema.otpAttempt)
      .where(lte(schema.otpAttempt.createdAt, new Date(now.getTime() - DAY_MS)));
    return null;
  });
  if (refusal) throw refusal;
}

async function assertNotLocked(identifier: string, now: Date): Promise<void> {
  const refusal = otpRefusal(await recentAttempts(db, identifier, now), 'verify', now);
  if (refusal) throw refusal;
}

async function recordWrongGuess(identifier: string, now: Date): Promise<void> {
  await db.insert(schema.otpAttempt).values({ identifier, kind: 'wrong_guess', createdAt: now });
}

function otpRoute(path: string | undefined): OtpRoute | undefined {
  return path ? OTP_ROUTES.get(path) : undefined;
}

function otpIdentifier(route: OtpRoute, body: unknown): string | undefined {
  if (route.channel === 'email') {
    const email = bodyString(body, 'email');
    return email ? `email:${email.toLowerCase()}` : undefined;
  }
  // Codes are only issued to allowed numbers; the endpoint rejects the rest.
  const phoneNumber = bodyString(body, 'phoneNumber');
  return phoneNumber && isAllowedPhoneNumber(phoneNumber) ? `phone:${phoneNumber}` : undefined;
}

/** Sends cost money, so limit-storage failures refuse the request instead of skipping the check. */
async function failClosed(
  logger: { error: (message: string, error: unknown) => void },
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (isAPIError(error)) throw error;
    logger.error('OTP limit storage failed', error);
    throw new APIError('SERVICE_UNAVAILABLE', {
      code: 'OTP_LIMIT_UNAVAILABLE',
      message: 'Sign-in codes are temporarily unavailable. Try again shortly.',
    });
  }
}

/** Shared per-identifier send and wrong-guess limits for phone and email login codes. */
export function otpGuard() {
  return {
    id: 'otp-guard',
    hooks: {
      before: [
        {
          matcher: (ctx) => otpRoute(ctx.path) !== undefined,
          handler: createAuthMiddleware(async (ctx) => {
            const route = otpRoute(ctx.path);
            const identifier = route && otpIdentifier(route, ctx.body);
            if (!route || !identifier) return;
            const now = new Date();
            await failClosed(ctx.context.logger, () =>
              route.step === 'send'
                ? reserveSend(identifier, now)
                : assertNotLocked(identifier, now),
            );
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => otpRoute(ctx.path)?.step === 'verify',
          handler: createAuthMiddleware(async (ctx) => {
            const route = otpRoute(ctx.path);
            const identifier = route && otpIdentifier(route, ctx.body);
            const returned = ctx.context.returned;
            if (!identifier || !isAPIError(returned)) return;
            if (!WRONG_GUESS_CODES.has(returned.body?.code ?? '')) return;
            await failClosed(ctx.context.logger, () => recordWrongGuess(identifier, new Date()));
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
