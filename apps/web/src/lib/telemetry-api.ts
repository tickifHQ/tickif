import { hc } from 'hono/client';
import type { AppType } from '@repo/api';
import { telemetryLogsRequestSchema, telemetryLogsResponseSchema, type TelemetryLogEvent } from '@repo/contracts';
import type { LogRecord } from '@repo/logger';
import { env } from '@/env';

const MAX_BATCH_BYTES = 24 * 1024;
const encoder = new TextEncoder();
const telemetryApi = hc<AppType>(env.NEXT_PUBLIC_API_URL, {
  fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => fetch(input, {
    ...init,
    credentials: 'omit',
    keepalive: true,
    signal: init?.signal ?? AbortSignal.timeout(2_000),
  }),
});

function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

/** Copy only the ingress contract's allowlist; never transmit browser identity. */
export function toTelemetryEvent(record: LogRecord): TelemetryLogEvent | undefined {
  if (record.severity_text !== 'WARN' && record.severity_text !== 'ERROR' && record.severity_text !== 'FATAL') return;
  const rawError = record.attributes.error ?? record.attributes.err;
  const error = rawError && typeof rawError === 'object' && !Array.isArray(rawError) ? rawError : undefined;
  return {
    level: record.severity_text === 'WARN' ? 'warn' : 'error',
    event: record.event.slice(0, 80).replace(/[^a-zA-Z0-9._-]/g, '_') || 'browser.error',
    message: record.message.slice(0, 1_000),
    timestamp: record.timestamp,
    release: record.version.slice(0, 120),
    ...(error ? { error: {
      name: text(error.name, 80) ?? 'Error',
      message: text(error.message, 1_000) ?? 'Browser error',
      ...(typeof error.stack === 'string' ? { stack: error.stack.slice(0, 4_000) } : {}),
    } } : {}),
    attributes: {
      component: text(record.attributes.component, 120),
      errorCode: text(record.attributes.errorCode, 80),
    },
  };
}

/** Drop failed batches: telemetry never retries into an outage or a rate limit. */
export async function sendBrowserLogs(records: LogRecord[]): Promise<void> {
  const deadline = AbortSignal.timeout(2_000);
  let events: TelemetryLogEvent[] = [];
  const send = async () => {
    if (events.length === 0) return;
    const parsed = telemetryLogsRequestSchema.safeParse({ events });
    events = [];
    if (!parsed.success) return;
    try {
      const response = await telemetryApi.api.telemetry.logs.$post({ json: parsed.data }, { init: { signal: deadline } });
      if (!response.ok) return;
      telemetryLogsResponseSchema.safeParse(await response.json());
    } catch {
      // Do not report transport errors through this same transport.
    }
  };
  for (const record of records) {
    if (deadline.aborted) return;
    const event = toTelemetryEvent(record);
    if (!event) continue;
    if (events.length >= 10 || encoder.encode(JSON.stringify({ events: [...events, event] })).byteLength > MAX_BATCH_BYTES) await send();
    events.push(event);
  }
  await send();
}
