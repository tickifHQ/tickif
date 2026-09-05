import { z } from 'zod';

/** Test runner boundary only. Never imported by deployed API/web/worker code. */
const localUrl = z
  .url()
  .refine(
    (value) => ['localhost', '127.0.0.1'].includes(new URL(value).hostname),
    'E2E services must use loopback hosts',
  );
export const e2eEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test']).default('test'),
    DATABASE_URL_TEST: localUrl
      .refine(
        (value) => /^\/[a-z0-9_]+_test$/.test(new URL(value).pathname),
        'E2E database must end in _test',
      )
      .refine(
        (value) => new URL(value).pathname !== '/tickif_test',
        'E2E database must not use the shared integration-test database',
      )
      .default('postgresql://tickif:tickif@localhost:5432/tickif_stage12_test'),
    REDIS_URL_TEST: localUrl
      .refine(
        (value) => /^\/(?:[1-9]|1[0-5])$/.test(new URL(value).pathname),
        'E2E Redis needs a dedicated nonzero database',
      )
      .refine(
        (value) => new URL(value).pathname !== '/15',
        'E2E Redis must not use the shared integration-test database',
      )
      .default('redis://localhost:6379/12'),
    TYPESENSE_HOST: localUrl.default('http://localhost:8108'),
    TYPESENSE_API_KEY: z.string().min(16).default('tickif-local-typesense-key'),
    TYPESENSE_COLLECTION_PREFIX: z
      .string()
      .regex(/^tickif_(?:stage\d+|e2e)(?:_[a-z0-9]+)*$/)
      .default('tickif_e2e'),
    R2_ENDPOINT: localUrl.default('http://localhost:9000'),
    R2_ACCESS_KEY_ID: z.string().min(1).default('minioadmin'),
    R2_SECRET_ACCESS_KEY: z.string().min(1).default('minioadmin'),
    R2_BUCKET: z
      .string()
      .regex(/^tickif-(?:stage\d+|e2e)(?:-[a-z0-9]+)*$/)
      .default('tickif-e2e'),
    BETTER_AUTH_URL: localUrl.default('http://localhost:3001'),
    PUBLIC_WEB_URL: localUrl.default('http://localhost:3000'),
    WORKER_HEALTH_PORT: z.coerce.number().int().min(1024).max(65535).default(3002),
    E2E_PROVIDER_PORT: z.coerce.number().int().min(1024).max(65535).default(3103),
  })
  .meta({ id: 'E2eEnvironment' });

export function buildE2eEnvironment(environment: NodeJS.ProcessEnv) {
  const result = e2eEnvironmentSchema.safeParse(environment);
  if (!result.success)
    throw new Error(
      `Unsafe E2E environment: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  const values = result.data;
  if (environment.DATABASE_URL && environment.DATABASE_URL !== values.DATABASE_URL_TEST)
    throw new Error('E2E DATABASE_URL must match DATABASE_URL_TEST');
  const api = new URL(values.BETTER_AUTH_URL);
  const web = new URL(values.PUBLIC_WEB_URL);
  if (api.protocol !== 'http:' || web.protocol !== 'http:' || api.hostname !== web.hostname)
    throw new Error('Local E2E API and web require HTTP on the same loopback hostname');
  const ports = [
    Number(api.port || 80),
    Number(web.port || 80),
    values.WORKER_HEALTH_PORT,
    values.E2E_PROVIDER_PORT,
  ];
  if (new Set(ports).size !== ports.length)
    throw new Error('E2E API, web, worker and provider ports must differ');
  const serialized = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, String(value)]),
  ) as { [K in keyof typeof values]: string };
  return {
    ...environment,
    ...serialized,
    NODE_ENV: 'test',
    DATABASE_URL: values.DATABASE_URL_TEST,
    REDIS_URL: values.REDIS_URL_TEST,
    TYPESENSE_SEARCH_API_KEY: values.TYPESENSE_API_KEY,
    BETTER_AUTH_SECRET: 'tickif-e2e-only-auth-secret-000000000000000000',
    GOOGLE_CLIENT_ID: 'tickif-e2e-google-client',
    GOOGLE_CLIENT_SECRET: 'tickif-e2e-google-secret',
    RESEND_API_KEY: 're_tickif_e2e_provider_double',
    EMAIL_FROM: 'Tickif E2E <e2e@tickif.test>',
    SMS_PROVIDER: 'console',
    NEXT_PUBLIC_API_URL: api.origin,
    NEXT_PUBLIC_WEB_URL: web.origin,
    NEXT_PUBLIC_SCROLL_GATE_LIMIT: '0',
    TRUSTED_ORIGINS: web.origin,
    MEDIA_WORKER_CONCURRENCY: '1',
    SEARCH_WORKER_CONCURRENCY: '1',
    NODE_OPTIONS: '--max-old-space-size=4096',
  } satisfies NodeJS.ProcessEnv;
}

/** Called before imports of DB/auth/config singletons, including Playwright workers. */
export function installE2eEnvironment() {
  const environment = buildE2eEnvironment(process.env);
  Object.assign(process.env, environment);
  return environment;
}
