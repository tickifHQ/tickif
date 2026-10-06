import type { TelemetryLogsRequest, TelemetryLogsResponse } from '@repo/contracts';
import { metrics } from '@repo/telemetry/node';
import { log } from '../../lib/logger.js';

const meter = metrics.getMeter('tickif.api.telemetry');
const accepted = meter.createCounter('tickif.browser.logs.accepted', { description: 'Validated browser events accepted' });
const rejected = meter.createCounter('tickif.browser.logs.rejected', { description: 'Rejected browser batches' });

const pageCategories = new Set(['login', 'signup', 'home', 'designer', 'designers', 'projects', 'profile', 'settings', 'subscribe', 'billing', 'reviews', 'bookings']);

function pageCategory(page: string | undefined): string | undefined {
  if (!page) return undefined;
  if (page === '/') return '/';
  const category = page.split('/')[1] ?? '';
  return pageCategories.has(category) ? `/${category}/*` : '/other';
}

/** All source labels are assigned here; client identity/trace/service claims are rejected. */
export function ingestBrowserLogs(input: TelemetryLogsRequest): TelemetryLogsResponse {
  for (const entry of input.events) {
    const fields = {
      event: `browser.${entry.event}`,
      telemetrySource: 'browser',
      sourceService: 'tickif-browser',
      browserTimestamp: entry.timestamp,
      browserRelease: entry.release,
      page: pageCategory(entry.page),
      err: entry.error,
      ...entry.attributes,
    };
    // The shared logger sanitizes strings/errors again after ingress validation.
    log[entry.level](fields, entry.message);
  }
  accepted.add(input.events.length);
  return { accepted: input.events.length };
}

export function recordBrowserRejection(reason: 'disabled' | 'origin' | 'content_type' | 'body_size' | 'rate_limit' | 'timeout'): void {
  rejected.add(1, { reason });
}

/** Process-local fixed budgets bound ingestion even when callers forge source headers. */
export function createBrowserLimiter(now: () => number = Date.now) {
  const origins = new Map<string, number>();
  let windowStart = now();
  let total = 0;
  return (origin: string): boolean => {
    const timestamp = now();
    if (timestamp < windowStart || timestamp - windowStart >= 60_000) {
      origins.clear();
      total = 0;
      windowStart = timestamp;
    }
    const count = origins.get(origin) ?? 0;
    if (total >= 120 || count >= 60 || (!origins.has(origin) && origins.size >= 128)) return false;
    total += 1;
    origins.set(origin, count + 1);
    return true;
  };
}
