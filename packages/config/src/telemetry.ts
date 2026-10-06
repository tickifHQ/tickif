import { z } from 'zod';
import { loadRootEnv } from './load-env';
import { frameworkRuntimeSchema } from './framework-runtime';

export { getFrameworkRuntime } from './framework-runtime';

function blankToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

const strictBoolean = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

// The SDK merges these ambient headers even when explicitly passed headers: {}.
// Retain only presence, never the actual credential/header string in config.
const unsupportedExporterHeaders = z.preprocess(
  (value) => typeof value === 'string' && value.trim().length > 0,
  z.boolean(),
);

function safeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

const urlSchema = z.url();

function origin(value: string): string | undefined {
  const parsed = urlSchema.safeParse(value);
  if (!parsed.success || !safeHttpUrl(parsed.data)) return undefined;
  return new URL(parsed.data).origin;
}

/** Shared app settings; exporting the schema never initializes an SDK or reads env. */
export const telemetrySchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DEPLOYMENT_ENV: z.enum(['production', 'staging']).default('production'),
  NEXT_RUNTIME: frameworkRuntimeSchema,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  TELEMETRY_ENABLED: strictBoolean,
  OTEL_SERVICE_NAME: z.preprocess(
    blankToUndefined,
    z.enum(['tickif-api', 'tickif-worker', 'tickif-web', 'tickif-browser']).optional(),
  ),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.preprocess(
    blankToUndefined,
    z.url()
      .refine(safeHttpUrl, 'must be an HTTP(S) base URL without credentials, query, or fragment')
      .optional(),
  ),
  OTEL_EXPORTER_OTLP_HEADERS: unsupportedExporterHeaders,
  OTEL_EXPORTER_OTLP_TRACES_HEADERS: unsupportedExporterHeaders,
  OTEL_EXPORTER_OTLP_METRICS_HEADERS: unsupportedExporterHeaders,
  OTEL_TRACES_SAMPLER_ARG: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(1).default(0.1)),
  APP_VERSION: z.string().trim().min(1).max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/).default('unknown'),
  TELEMETRY_BROWSER_INGEST_ENABLED: strictBoolean,
  TELEMETRY_QUEUE_METRICS_ENABLED: strictBoolean,
  TELEMETRY_BROWSER_ALLOWED_ORIGINS: z.string()
    .optional()
    .transform((value) => value?.trim() ? value.split(',').map((item) => item.trim()) : undefined)
    .pipe(z.array(z.url().refine(
      (value) => safeHttpUrl(value) && new URL(value).pathname === '/',
      'must be an HTTP(S) origin',
    )).min(1).optional()),
  TRUSTED_ORIGINS: z.string().optional().transform((value) =>
    value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [],
  ),
  PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
  NEXT_PUBLIC_WEB_URL: z.url().optional(),
});

type TelemetrySettings = z.infer<typeof telemetrySchema>;

const exporterHeaderSchema = telemetrySchema.pick({
  OTEL_EXPORTER_OTLP_HEADERS: true,
  OTEL_EXPORTER_OTLP_TRACES_HEADERS: true,
  OTEL_EXPORTER_OTLP_METRICS_HEADERS: true,
});

function configuredExporterHeaders(settings: z.infer<typeof exporterHeaderSchema>): string[] {
  return ([
    'OTEL_EXPORTER_OTLP_HEADERS',
    'OTEL_EXPORTER_OTLP_TRACES_HEADERS',
    'OTEL_EXPORTER_OTLP_METRICS_HEADERS',
  ] as const).filter((field) => settings[field]);
}

/** Validate the ambient process too when callers inject a typed SDK config. */
export function assertTelemetryExporterEnvironment(
  enabled: boolean,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (!enabled) return;
  const result = exporterHeaderSchema.safeParse(environment);
  if (!result.success) throw new Error('Invalid telemetry exporter environment');
  const fields = configuredExporterHeaders(result.data);
  if (fields.length > 0) {
    throw new Error(`Unsupported application telemetry headers: ${fields.join(', ')}`);
  }
}

function configuredBrowserOrigins(settings: TelemetrySettings): string[] {
  return settings.TELEMETRY_BROWSER_ALLOWED_ORIGINS ?? [
    settings.PUBLIC_WEB_URL,
    ...(settings.NEXT_PUBLIC_WEB_URL ? [settings.NEXT_PUBLIC_WEB_URL] : []),
    ...settings.TRUSTED_ORIGINS,
  ];
}

/** Shared refinement also applied to the complete API/worker config. */
export function refineTelemetryConfig(settings: TelemetrySettings, context: z.RefinementCtx): void {
  if (settings.TELEMETRY_ENABLED) {
    for (const field of configuredExporterHeaders(settings)) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: 'unsupported application exporter headers; collector owns ingestion credentials',
      });
    }
  }
  if (settings.TELEMETRY_ENABLED && !settings.OTEL_EXPORTER_OTLP_ENDPOINT) {
    context.addIssue({
      code: 'custom',
      path: ['OTEL_EXPORTER_OTLP_ENDPOINT'],
      message: 'required when TELEMETRY_ENABLED=true',
    });
  }
  if (
    settings.TELEMETRY_BROWSER_INGEST_ENABLED &&
    configuredBrowserOrigins(settings).some((value) => !origin(value))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['TRUSTED_ORIGINS'],
      message: 'browser telemetry requires HTTP(S) origins without credentials, query, or fragment',
    });
  }
}

export function telemetryIdentity(settings: TelemetrySettings) {
  return {
    DEPLOYMENT_ENVIRONMENT:
      settings.NODE_ENV === 'production' ? settings.DEPLOYMENT_ENV : settings.NODE_ENV,
    TELEMETRY_BROWSER_ALLOWED_ORIGINS: [...new Set(configuredBrowserOrigins(settings).flatMap((value) => {
      const normalized = origin(value);
      return normalized ? [normalized] : [];
    }))],
  };
}

export type TelemetryConfig = TelemetrySettings & ReturnType<typeof telemetryIdentity>;

const refinedTelemetrySchema = telemetrySchema.superRefine(refineTelemetryConfig);

/** Narrow server parser: auth/storage/database credentials are never required. */
export function parseTelemetryConfig(environment: NodeJS.ProcessEnv): TelemetryConfig {
  const result = refinedTelemetrySchema.safeParse(environment);
  if (!result.success) {
    // Enum errors can echo invalid input: report field names without raw values.
    const paths = [...new Set(result.error.issues.map((issue) => issue.path.join('.') || '(root)'))];
    throw new Error(`Invalid telemetry configuration: ${paths.join(', ')}`);
  }
  return { ...result.data, ...telemetryIdentity(result.data) };
}

/** Lazy accessor keeps Next builds free of unrelated credential validation. */
export function getTelemetryConfig(): TelemetryConfig {
  loadRootEnv();
  return parseTelemetryConfig(process.env);
}
