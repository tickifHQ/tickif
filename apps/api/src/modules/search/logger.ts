/**
 * Structured search logging helpers (E-261).
 *
 * Wraps console.info with typed payloads so:
 * 1. Log format is consistent across the search module.
 * 2. Future migration to a real audit/event bus is a single-file change.
 *
 * All log calls are fire-and-forget — they never throw to callers.
 */

type SearchQueryLog = {
  type: 'search.query';
  q: string;
  hits: number;
  processingTimeMs: number;
  fallback: string;
  relaxedFilters: string[];
  timestamp: string;
};

type ZeroResultLog = {
  type: 'search.zero_results';
  q: string;
  filters: Record<string, string[]>;
  timestamp: string;
};

export function logSearchQuery(data: Omit<SearchQueryLog, 'type' | 'timestamp'>): void {
  try {
    const event: SearchQueryLog = { type: 'search.query', ...data, timestamp: new Date().toISOString() };
    console.info(JSON.stringify(event));
  } catch {
    // Fire-and-forget — never throw to callers
  }
}

export function logZeroResults(data: Omit<ZeroResultLog, 'type' | 'timestamp'>): void {
  try {
    const event: ZeroResultLog = { type: 'search.zero_results', ...data, timestamp: new Date().toISOString() };
    console.info(JSON.stringify(event));
  } catch {
    // Fire-and-forget — never throw to callers
  }
}
