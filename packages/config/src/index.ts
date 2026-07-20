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

  // Postgres — the connection string is built from these parts (see below).
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_USER: z.string().default('tickif'),
  POSTGRES_PASSWORD: z.string().default('tickif'),
  POSTGRES_DB: z.string().default('tickif'),
  // Optional explicit overrides. Used by managed DBs (a single connection
  // string) and by the test harness, which injects DATABASE_URL to point
  // integration tests at the `_test` database. When unset, the URL is built
  // from the POSTGRES_* parts above.
  DATABASE_URL: z.string().url().optional(),
  DATABASE_URL_TEST: z.string().url().optional(),

  // Redis (cache + BullMQ) — connection string built from these parts.
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_URL: z.string().url().optional(),
  // Dedicated Redis target for integration tests (use a separate DB index, e.g. /15).
  REDIS_URL_TEST: z.string().url().optional(),

  // Meilisearch. The local key matches docker-compose; production startup
  // rejects it in @repo/search so a development credential cannot leak through.
  MEILI_HOST: z.string().url().default('http://localhost:7700'),
  MEILI_MASTER_KEY: z.string().min(16).default('tickif-local-master-key'),
  MEILI_INDEX_PREFIX: z
    .string()
    .trim()
    .min(1)
    .max(48)
    .regex(/^[a-z0-9][a-z0-9_-]*$/)
    .default('tickif'),

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

  // Google / Gmail SSO — optional in dev, required for the social flow.
  // Both must be provided together or both omitted.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  // API
  PORT: z.coerce.number().int().positive().default(8008),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:8008'),

  // Public web origin for shareable URLs returned by the API.
  PUBLIC_WEB_URL: z.string().url().default('https://tickif.com'),

  // SMS / OTP provider. Selection is explicit; creds are per-provider.
  SMS_PROVIDER: z.enum(['console', 'novu']).default('console'),
  NOVU_SECRET_KEY: z.string().optional(),
  NOVU_OTP_WORKFLOW_ID: z.string().optional(),
  NOVU_API_URL: z.string().url().default('https://api.novu.co'),

  // Cloudflare R2 (media). Endpoint defaults to the account's S3 API host; set
  // R2_ENDPOINT explicitly to point at a local minio in tests/dev.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ENDPOINT: z.string().url().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_UPLOAD_URL_EXPIRY_SECONDS: z.coerce.number().int().positive().default(600),
  R2_DOWNLOAD_URL_EXPIRY_SECONDS: z.coerce.number().int().positive().default(3600),

  // Media upload limits (E-107). MAX_IMAGE_PIXELS is the decompression-bomb
  // budget — checked from header dims before any pixel decode.
  MEDIA_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(15_000_000),
  MEDIA_MAX_IMAGE_DIMENSION: z.coerce.number().int().positive().default(12_000),
  MEDIA_MAX_IMAGE_PIXELS: z.coerce.number().int().positive().default(40_000_000),
  // Concurrent media jobs per worker (E-112). Image work is CPU-heavy; cap it.
  // Peak worker memory ≈ MEDIA_WORKER_CONCURRENCY × MEDIA_MAX_IMAGE_PIXELS × 4 bytes; size the container to match.
  MEDIA_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(3002),

  // Watermark on public derivatives only (E-109); originals stay clean.
  WATERMARK_ENABLED: z.stringbool().optional().default(true),
  WATERMARK_TEXT: z.string().trim().min(1).default('tickif'),
  // Bounds stay [0, 1] so envs configured under the pre-revision schema (e.g. 0.6)
  // still boot; 0.22 is the recommended restrained default.
  WATERMARK_OPACITY: z.coerce.number().min(0).max(1).default(0.22),
  WATERMARK_SCALE: z.coerce.number().min(0.08).max(0.3).default(0.16),
  WATERMARK_ROTATION: z.coerce.number().min(-60).max(60).default(-30),
  WATERMARK_REVISION: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,31}$/)
    .default('wm-v2'),

  // Perceptual-hash dedup (E-110). Near-duplicate if Hamming distance ≤ threshold.
  // Action on a duplicate: reject (status=failed) or flag for moderation.
  MEDIA_DEDUP_HAMMING_THRESHOLD: z.coerce.number().int().min(0).max(64).default(10),
  MEDIA_DEDUP_ACTION: z.enum(['reject', 'flag']).default('reject'),

  // Email delivery via Resend (E-203). Optional in dev (logs to console).
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Tickif <noreply@tickif.com>'),
});

/**
 * Cross-field refinement: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both
 * be provided or both omitted. A single value without its pair is a
 * misconfiguration that should fail fast.
 */
const refinedEnvSchema = envSchema.refine(
  (env) => {
    const hasId = Boolean(env.GOOGLE_CLIENT_ID);
    const hasSecret = Boolean(env.GOOGLE_CLIENT_SECRET);
    return hasId === hasSecret;
  },
  {
    message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be provided or both omitted',
    path: ['GOOGLE_CLIENT_ID'],
  },
);

type RawEnv = z.infer<typeof envSchema>;

/**
 * Public config: the raw env plus the connection strings, which are always
 * present (built from parts when not explicitly provided).
 */
export type Config = Omit<RawEnv, 'DATABASE_URL' | 'DATABASE_URL_TEST' | 'REDIS_URL'> & {
  DATABASE_URL: string;
  DATABASE_URL_TEST: string;
  REDIS_URL: string;
};

function postgresUrl(env: RawEnv, database: string): string {
  const user = encodeURIComponent(env.POSTGRES_USER);
  const password = encodeURIComponent(env.POSTGRES_PASSWORD);
  return `postgresql://${user}:${password}@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${database}`;
}

/**
 * R2 vars are optional in the schema (dev/test can run without media), but a
 * production process that mints presigned URLs or processes media must have them
 * — fail fast at boot rather than at first upload.
 */
function assertProductionMediaConfig(env: RawEnv): void {
  if (env.NODE_ENV !== 'production') return;
  const missing: string[] = [];
  if (!env.R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!env.R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
  if (!env.R2_BUCKET) missing.push('R2_BUCKET');
  if (!env.R2_ENDPOINT && !env.R2_ACCOUNT_ID) missing.push('R2_ENDPOINT or R2_ACCOUNT_ID');
  if (missing.length > 0) {
    const lines = missing.map((m) => `  - ${m}: required when NODE_ENV=production`).join('\n');
    throw new Error(`Invalid environment configuration:\n${lines}`);
  }
}

function loadConfig(): Config {
  const parsed = refinedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  assertProductionMediaConfig(env);
  return {
    ...env,
    DATABASE_URL: env.DATABASE_URL ?? postgresUrl(env, env.POSTGRES_DB),
    DATABASE_URL_TEST: env.DATABASE_URL_TEST ?? postgresUrl(env, `${env.POSTGRES_DB}_test`),
    REDIS_URL: env.REDIS_URL ?? `redis://${env.REDIS_HOST}:${env.REDIS_PORT}`,
  };
}

export const config: Config = loadConfig();

export const isProduction = config.NODE_ENV === 'production';
export const isDevelopment = config.NODE_ENV === 'development';
export const isTest = config.NODE_ENV === 'test';
