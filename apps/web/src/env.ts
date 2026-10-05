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
  server: {
    // Origin allow-list for social-image reads; no storage credentials are needed.
    R2_ENDPOINT: z.url().optional(),
    R2_ACCOUNT_ID: z
      .string()
      .regex(/^[a-f0-9]{32}$/i)
      .optional(),
  },
  client: {
    // Public base URL the web app uses to reach the API.
    NEXT_PUBLIC_API_URL: z.url().default('http://localhost:8008'),
    // Public origin of the web app, used to build browser-visible links.
    NEXT_PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
    NEXT_PUBLIC_TELEMETRY_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    NEXT_PUBLIC_APP_VERSION: z.string().trim().min(1).max(120).default('development'),
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
  runtimeEnv: {
    R2_ENDPOINT: process.env.R2_ENDPOINT,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
    NEXT_PUBLIC_TELEMETRY_ENABLED: process.env.NEXT_PUBLIC_TELEMETRY_ENABLED,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
    NEXT_PUBLIC_SCROLL_GATE_LIMIT: process.env.NEXT_PUBLIC_SCROLL_GATE_LIMIT,
  },
  emptyStringAsUndefined: true,
});
