import type { Config } from '@repo/config';

const MSG91_ENDPOINT = 'https://control.msg91.com/api/sendhttp.php';
const MSG91_TIMEOUT_MS = 10_000;

/** A delivery strategy. Phone numbers arrive already normalized to digits (see @repo/queue). */
export type SmsSender = {
  send(phoneNumber: string, code: string): Promise<void>;
};

/** Dev/local only: logs the code instead of sending. Never selected in production. */
export class ConsoleSmsSender implements SmsSender {
  async send(phoneNumber: string, code: string): Promise<void> {
    console.log(`[sms] OTP for ${phoneNumber}: ${code}`);
  }
}

/** Fail-closed: selected in production when the chosen provider has no credentials. */
export class MissingSmsSender implements SmsSender {
  async send(): Promise<void> {
    throw new Error('SMS provider is not configured (missing credentials in production)');
  }
}

export class Msg91SmsSender implements SmsSender {
  constructor(
    private readonly authKey: string,
    private readonly senderId: string,
  ) {}

  async send(phoneNumber: string, code: string): Promise<void> {
    const body = new URLSearchParams({
      authkey: this.authKey,
      mobiles: phoneNumber, // already digits-only (normalized at enqueue)
      message: `Your Tickif verification code is ${code}`,
      sender: this.senderId,
      route: '4',
      // `mobiles` already carries the country code (normalized digits include 91),
      // so we don't pass a separate `country` param — avoids a double prefix.
    });

    let response: Response;
    try {
      response = await fetch(MSG91_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        // fetch has no default timeout and BullMQ imposes no job timeout, so a hung
        // request would pin a concurrency slot forever. Bound it; BullMQ retries.
        signal: AbortSignal.timeout(MSG91_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`MSG91 SMS request failed: ${(err as Error).message}`);
    }

    if (!response.ok) {
      throw new Error(`MSG91 SMS request failed with status ${response.status}`);
    }

    // The legacy sendhttp.php endpoint returns HTTP 200 even on logical failures
    // (e.g. bad authkey), with the error in the body — so treat an error-shaped
    // body as a failure instead of silently completing (which would skip retries).
    // TODO(phase-0): confirm the exact success/error contract against MSG91 docs, or
    // move to the v5 flow API which has cleaner status semantics (E-14 / E-16).
    const text = (await response.text()).trim();
    if (/"type"\s*:\s*"error"|^error\b|\bfailure\b/i.test(text)) {
      throw new Error(`MSG91 SMS rejected: ${text.slice(0, 200)}`);
    }
  }
}

export type SmsProvider = Config['SMS_PROVIDER'];

export type SelectSmsSenderOptions = {
  provider: SmsProvider;
  authKey?: string;
  senderId?: string;
  isProduction: boolean;
};

/**
 * Explicit, config-driven provider selection. Each provider is a self-contained
 * `SmsSender` strategy, so adding one later (Twilio, Plivo, …) is a new `case`
 * here rather than a refactor. When the selected provider has no credentials it
 * falls back to the console sender in dev and fails closed in production.
 */
export function selectSmsSender(options: SelectSmsSenderOptions): SmsSender {
  switch (options.provider) {
    case 'msg91':
      return options.authKey && options.senderId
        ? new Msg91SmsSender(options.authKey, options.senderId)
        : options.isProduction
          ? new MissingSmsSender()
          : new ConsoleSmsSender();
    case 'console':
      // Console must never deliver in production (it would log the OTP) — fail closed.
      return options.isProduction ? new MissingSmsSender() : new ConsoleSmsSender();
  }
  // Exhaustive over SmsProvider — this guards any new enum value at compile time.
  const unreachable: never = options.provider;
  throw new Error(`Unsupported SMS provider: ${String(unreachable)}`);
}
