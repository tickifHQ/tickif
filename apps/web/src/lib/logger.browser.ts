import { createBrowserLogger } from '@repo/logger/browser';
import { env } from '@/env';
import { createErrorReporter, installErrorListeners } from '@/lib/browser-errors';
import { sendBrowserLogs } from '@/lib/telemetry-api';

export const browserLogger = createBrowserLogger({
  service: 'tickif-browser',
  // Browser metadata is untrusted; the API assigns deployment identity.
  environment: 'browser',
  version: env.NEXT_PUBLIC_APP_VERSION,
  enabled: env.NEXT_PUBLIC_TELEMETRY_ENABLED,
  level: 'warn',
  send: sendBrowserLogs,
  maxQueueSize: 50,
  batchSize: 5,
  flushIntervalMs: 5_000,
  flushTimeoutMs: 3_000,
});

export const reportBrowserError = createErrorReporter((error, component) => {
  const digest = typeof error === 'object' && error !== null && 'digest' in error && typeof error.digest === 'string'
    ? error.digest
    : undefined;
  browserLogger.error({
    event: 'browser.error',
    error: error instanceof Error ? error : new Error('Unhandled non-Error rejection'),
    component,
    ...(digest ? { errorCode: digest } : {}),
  }, 'Browser application error');
});

const INSTALL_KEY = Symbol.for('tickif.browser.telemetry.listeners');
type InstrumentedWindow = Window & { [INSTALL_KEY]?: () => void };

export function initializeBrowserTelemetry(): void {
  if (!env.NEXT_PUBLIC_TELEMETRY_ENABLED || typeof window === 'undefined') return;
  const target: InstrumentedWindow = window;
  target[INSTALL_KEY]?.();
  target[INSTALL_KEY] = installErrorListeners(target, reportBrowserError, () => browserLogger.flush());
}
