import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

/**
 * Single source of truth for all environment variables used by the web app.
 * Validated at build time (imported from next.config.ts) — a bad or missing
 * value fails the build instead of surfacing as a runtime bug.
 *
 * Add new variables here, never read process.env directly elsewhere.
 */
export const env = createEnv({
  client: {
    // Public base URL the web app uses to reach the API.
    NEXT_PUBLIC_API_URL: z.url().default('http://localhost:8008'),
    // Public origin of the web app, used to build browser-visible links.
    NEXT_PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
    // Cumulative downward scroll-units (400px each) before anon users hit the
    // login wall on the public feed. 0 disables the gate entirely.
    // Strict digits-only shape: z.coerce would turn ' ' into 0 and silently
    // disable the gate.
    NEXT_PUBLIC_SCROLL_GATE_LIMIT: z
      .string()
      .trim()
      .regex(/^\d+$/, 'must be a non-negative integer')
      .default('5')
      .transform(Number),
  },
  // NEXT_PUBLIC_* vars are inlined by Next at build time, so they must be
  // referenced literally here for the client bundle to see them.
  experimental__runtimeEnv: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
    NEXT_PUBLIC_SCROLL_GATE_LIMIT: process.env.NEXT_PUBLIC_SCROLL_GATE_LIMIT,
  },
  emptyStringAsUndefined: true,
});
