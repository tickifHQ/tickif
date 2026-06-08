import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Autoload the repo-root `.env` by walking up from cwd until one is found, so
 * every workspace command (api, web, worker, drizzle-kit) picks up env without
 * the caller exporting it. Real process env always wins (override: false).
 */
function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}
loadRootEnv();

/**
 * Single source of truth for environment configuration.
 *
 * Every app/package imports `config` from here instead of touching
 * `process.env` directly, so misconfiguration fails fast at boot with a
 * readable error rather than surfacing as a confusing runtime bug.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database
  DATABASE_URL: z.string().url(),
  // Separate DB for integration tests (only required in test runs).
  DATABASE_URL_TEST: z.string().url().optional(),

  // Redis (cache + BullMQ)
  REDIS_URL: z.string().url(),

  // better-auth
  BETTER_AUTH_SECRET: z.string().min(16, 'BETTER_AUTH_SECRET must be at least 16 chars'),
  BETTER_AUTH_URL: z.string().url(),

  // Comma-separated list of trusted origins for cross-origin auth requests.
  // In dev: the web app origin (e.g. "http://localhost:3000").
  // In prod same-origin: leave empty. Cross-origin: add the web app domain.
  TRUSTED_ORIGINS: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',').map((s) => s.trim()) : [])),

  // Google / Gmail SSO — optional in dev, required for the social flow
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // API
  PORT: z.coerce.number().int().positive().default(3001),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),

  // SMS / OTP provider (MSG91) — optional; stubbed in dev
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_SENDER_ID: z.string().optional(),

  // Cloudflare R2 (media — later phases)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const config: Config = loadConfig();

export const isProduction = config.NODE_ENV === 'production';
export const isDevelopment = config.NODE_ENV === 'development';
export const isTest = config.NODE_ENV === 'test';
