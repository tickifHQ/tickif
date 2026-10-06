import { afterEach, describe, expect, it, vi } from 'vitest';
import { testEnv } from '@repo/vitest-config/node';
import { parseConfig } from '../src/index.js';
import {
  assertTelemetryExporterEnvironment,
  getFrameworkRuntime,
  getTelemetryConfig,
  parseTelemetryConfig,
} from '../src/telemetry.js';

afterEach(() => vi.unstubAllEnvs());

describe('telemetry configuration', () => {
  it('defaults to local stdout logging without requiring export or app credentials', () => {
    const config = parseTelemetryConfig({});
    expect(config.TELEMETRY_ENABLED).toBe(false);
    expect(config.TELEMETRY_BROWSER_INGEST_ENABLED).toBe(false);
    expect(config.TELEMETRY_QUEUE_METRICS_ENABLED).toBe(false);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.APP_VERSION).toBe('unknown');
    expect(config.OTEL_SERVICE_NAME).toBeUndefined();
    expect(config.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
    expect(config.OTEL_TRACES_SAMPLER_ARG).toBe(0.1);
    expect(config).not.toHaveProperty('SIGNOZ_INGESTION_KEY');
  });

  it('loads narrow production settings without auth or storage credentials', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_SECRET', '');
    vi.stubEnv('BETTER_AUTH_URL', '');
    vi.stubEnv('TELEMETRY_ENABLED', 'false');
    vi.stubEnv('TELEMETRY_BROWSER_INGEST_ENABLED', 'false');
    expect(getTelemetryConfig().NODE_ENV).toBe('production');
  });

  it.each([
    ['development', 'production', 'development'],
    ['test', 'staging', 'test'],
    ['production', 'staging', 'staging'],
    ['production', 'production', 'production'],
  ])('derives environment identity from %s/%s', (node, deployment, expected) => {
    expect(parseTelemetryConfig({ NODE_ENV: node, DEPLOYMENT_ENV: deployment }).DEPLOYMENT_ENVIRONMENT).toBe(expected);
  });

  it('requires a private exporter target only when SDK export is enabled', () => {
    expect(() => parseTelemetryConfig({ TELEMETRY_ENABLED: 'true' })).toThrow('OTEL_EXPORTER_OTLP_ENDPOINT');
    const config = parseTelemetryConfig({ TELEMETRY_ENABLED: 'true', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318' });
    expect(config.TELEMETRY_ENABLED).toBe(true);
    expect(config.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://otel-collector:4318');
  });

  it.each([
    'OTEL_EXPORTER_OTLP_HEADERS',
    'OTEL_EXPORTER_OTLP_TRACES_HEADERS',
    'OTEL_EXPORTER_OTLP_METRICS_HEADERS',
  ])('rejects ambient %s in both enabled parsers without retaining credentials', (field) => {
    const input = {
      ...testEnv(),
      TELEMETRY_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
      [field]: 'authorization=synthetic-private-credential',
    };
    for (const parse of [parseTelemetryConfig, parseConfig]) {
      expect(() => parse(input)).toThrow(field);
      expect(() => parse(input)).not.toThrow('synthetic-private-credential');
      const disabled = parse({ ...input, TELEMETRY_ENABLED: 'false' });
      expect(JSON.stringify(disabled)).not.toContain('synthetic-private-credential');
    }
  });

  it('guards ambient credentials even when the SDK receives an injected config', () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_HEADERS', 'authorization=synthetic-private-credential');
    expect(() => assertTelemetryExporterEnvironment(true)).toThrow('OTEL_EXPORTER_OTLP_HEADERS');
    expect(() => assertTelemetryExporterEnvironment(true)).not.toThrow('synthetic-private-credential');
    expect(() => assertTelemetryExporterEnvironment(false)).not.toThrow();
    expect(() => assertTelemetryExporterEnvironment(true, { OTEL_EXPORTER_OTLP_HEADERS: ' ' })).not.toThrow();
  });

  it.each([
    'ftp://collector:4318',
    'https://user:secret@collector:4318',
    'http://collector:4318?key=synthetic-secret',
    'http://collector:4318#synthetic-secret',
    'not-a-url',
  ])('rejects unsafe exporter target %s without echoing credentials', (endpoint) => {
    expect(() => parseTelemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: endpoint })).toThrow('OTEL_EXPORTER_OTLP_ENDPOINT');
    expect(() => parseTelemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: endpoint })).not.toThrow('synthetic-secret');
  });

  it.each(['true', 'false'])('parses strict boolean %s', (value) => {
    const config = parseTelemetryConfig({ TELEMETRY_ENABLED: value, OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318', TELEMETRY_BROWSER_INGEST_ENABLED: value, TELEMETRY_QUEUE_METRICS_ENABLED: value });
    expect(config.TELEMETRY_ENABLED).toBe(value === 'true');
    expect(config.TELEMETRY_BROWSER_INGEST_ENABLED).toBe(value === 'true');
    expect(config.TELEMETRY_QUEUE_METRICS_ENABLED).toBe(value === 'true');
  });

  it.each(['yes', '0', '1', 'FALSE', ''])('rejects ambiguous boolean %s', (value) => {
    expect(() => parseTelemetryConfig({ TELEMETRY_ENABLED: value })).toThrow('TELEMETRY_ENABLED');
  });

  it.each(['-0.1', '1.1', 'NaN', 'Infinity', 'secret-ratio'])('rejects invalid sampling ratio %s', (ratio) => {
    expect(() => parseTelemetryConfig({ OTEL_TRACES_SAMPLER_ARG: ratio })).toThrow('OTEL_TRACES_SAMPLER_ARG');
  });

  it.each(['0', '1', '0.25'])('accepts bounded sampling ratio %s', (ratio) => {
    expect(parseTelemetryConfig({ OTEL_TRACES_SAMPLER_ARG: ratio }).OTEL_TRACES_SAMPLER_ARG).toBe(Number(ratio));
  });

  it('treats blank optional inputs as absent rather than enabling all or no traces', () => {
    const config = parseTelemetryConfig({ OTEL_SERVICE_NAME: '', OTEL_EXPORTER_OTLP_ENDPOINT: ' ', OTEL_TRACES_SAMPLER_ARG: ' ' });
    expect(config.OTEL_TRACES_SAMPLER_ARG).toBe(0.1);
    expect(config.OTEL_SERVICE_NAME).toBeUndefined();
    expect(config.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
  });

  it('derives normalized unique allowed origins from public and trusted origins', () => {
    const config = parseTelemetryConfig({ PUBLIC_WEB_URL: 'https://staging.tickif.com', NEXT_PUBLIC_WEB_URL: 'https://staging.tickif.com/', TRUSTED_ORIGINS: ' https://partner.example, https://staging.tickif.com ' });
    expect(config.TELEMETRY_BROWSER_ALLOWED_ORIGINS).toEqual(['https://staging.tickif.com', 'https://partner.example']);
  });

  it('uses an explicit origin allowlist instead of derived values', () => {
    const config = parseTelemetryConfig({ TELEMETRY_BROWSER_ALLOWED_ORIGINS: 'https://frontend.example/, https://frontend.example', PUBLIC_WEB_URL: 'https://other.example' });
    expect(config.TELEMETRY_BROWSER_ALLOWED_ORIGINS).toEqual(['https://frontend.example']);
  });

  it.each(['https://web.example/path', '*', 'https://user:secret@web.example', 'https://web.example,'])('rejects invalid explicit origin allowlist %s', (value) => {
    expect(() => parseTelemetryConfig({ TELEMETRY_BROWSER_ALLOWED_ORIGINS: value })).toThrow('TELEMETRY_BROWSER_ALLOWED_ORIGINS');
  });

  it('only requires strict derived trusted origins when browser ingestion is enabled', () => {
    expect(() => parseTelemetryConfig({ TRUSTED_ORIGINS: '*' })).not.toThrow();
    expect(() => parseTelemetryConfig({ TRUSTED_ORIGINS: '*', TELEMETRY_BROWSER_INGEST_ENABLED: 'true' })).toThrow('TRUSTED_ORIGINS');
  });

  it('validates the same settings and computes identity in complete app config', () => {
    const config = parseConfig({ ...testEnv(), TELEMETRY_QUEUE_METRICS_ENABLED: 'true' });
    expect(config.DEPLOYMENT_ENVIRONMENT).toBe('test');
    expect(config.TELEMETRY_QUEUE_METRICS_ENABLED).toBe(true);
    expect(config.TELEMETRY_BROWSER_ALLOWED_ORIGINS).toEqual(['http://localhost:3000']);
    expect(() => parseConfig({ ...testEnv(), TELEMETRY_ENABLED: 'true' })).toThrow('OTEL_EXPORTER_OTLP_ENDPOINT');
  });

  it('does not expose malformed telemetry values through complete config errors', () => {
    expect(() => parseConfig({ ...testEnv(), LOG_LEVEL: 'synthetic-secret' })).not.toThrow('synthetic-secret');
    expect(() => parseTelemetryConfig({ APP_VERSION: 'synthetic secret', OTEL_SERVICE_NAME: 'secret-service' })).toThrow('APP_VERSION');
  });

  it('reads the framework runtime only through the config boundary', () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    expect(getFrameworkRuntime()).toBe('nodejs');
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    expect(getFrameworkRuntime()).toBe('edge');
    vi.stubEnv('NEXT_RUNTIME', 'unrecognized');
    expect(() => getFrameworkRuntime()).toThrow('NEXT_RUNTIME');
  });
});
