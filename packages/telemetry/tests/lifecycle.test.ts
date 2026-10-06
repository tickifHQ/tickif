import { describe, expect, it, vi } from 'vitest';
import { parseTelemetryConfig } from '@repo/config/telemetry';
import { createTelemetryController } from '../src/lifecycle.js';
import type { InitTelemetryOptions, TelemetryRuntime } from '../src/lifecycle.js';
import type { NodeSDKConfiguration } from '@opentelemetry/sdk-node';
import { ROOT_CONTEXT, SpanKind, trace } from '@opentelemetry/api';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';

function fixture() {
  const runtime: TelemetryRuntime = { start: vi.fn(), shutdown: vi.fn().mockResolvedValue(undefined) };
  const config = parseTelemetryConfig({
    NODE_ENV: 'production', DEPLOYMENT_ENV: 'staging', TELEMETRY_ENABLED: 'true',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318/prefix/', APP_VERSION: 'release-abc',
  });
  const sdkFactory = vi.fn((_options: Partial<NodeSDKConfiguration>) => runtime);
  const options: InitTelemetryOptions = { service: 'tickif-api', config, sdkFactory, instrumentation: 'none' };
  return { runtime, options, sdkFactory };
}

describe('telemetry lifecycle', () => {
  it('does not construct or initialize anything when disabled', () => {
    const { options, sdkFactory } = fixture();
    options.config = parseTelemetryConfig({});
    expect(createTelemetryController().init(options)).toBe(false);
    expect(sdkFactory).not.toHaveBeenCalled();
  });

  it.each([
    'OTEL_EXPORTER_OTLP_HEADERS', 'OTEL_EXPORTER_OTLP_TRACES_HEADERS', 'OTEL_EXPORTER_OTLP_METRICS_HEADERS',
  ])('rejects ambient %s before constructing an exporter even with injected config', (name) => {
    const { options, sdkFactory } = fixture();
    vi.stubEnv(name, 'authorization=Bearer-private');
    try {
      expect(createTelemetryController().init(options)).toBe(false);
      expect(sdkFactory).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });

  it('initializes once, assigns resource identity, and shuts down once', async () => {
    const { options, runtime, sdkFactory } = fixture();
    const controller = createTelemetryController();
    expect(controller.init(options)).toBe(true);
    expect(controller.init({ ...options, service: 'tickif-worker' })).toBe(true);
    expect(runtime.start).toHaveBeenCalledTimes(1);
    const configured = sdkFactory.mock.calls[0]?.[0];
    expect(configured?.resource?.attributes).toMatchObject({
      'service.name': 'tickif-api', 'service.version': 'release-abc', 'deployment.environment.name': 'staging',
    });
    expect(configured?.autoDetectResources).toBe(false);
    expect(configured?.logRecordProcessors).toEqual([]);
    expect(configured?.instrumentations).toEqual([]);
    expect(configured?.sampler?.toString()).toContain('ParentBased');
    expect(await controller.shutdown()).toBe(true);
    expect(await controller.shutdown()).toBe(true);
    expect(runtime.shutdown).toHaveBeenCalledTimes(1);
    expect(controller.init(options)).toBe(false);
  });

  it('does not turn an SDK failure into an application startup error', () => {
    const { options, runtime } = fixture();
    vi.mocked(runtime.start).mockImplementation(() => { throw new Error('secret provider detail'); });
    expect(createTelemetryController().init(options)).toBe(false);
  });

  it('honors upstream sampled and unsampled parents while applying the root ratio', () => {
    const { options, sdkFactory } = fixture();
    const controller = createTelemetryController();
    controller.init(options);
    const sampler = sdkFactory.mock.calls[0]?.[0].sampler;
    const sample = (parent = ROOT_CONTEXT) => sampler?.shouldSample(parent, 'ffffffff000000000000000000000000', 'test', SpanKind.INTERNAL, {}, []).decision;
    expect(sample()).toBe(SamplingDecision.NOT_RECORD);
    const sampled = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: '1'.repeat(32), spanId: '2'.repeat(16), traceFlags: 1, isRemote: true,
    });
    expect(sample(sampled)).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    const unsampled = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: '1'.repeat(32), spanId: '2'.repeat(16), traceFlags: 0, isRemote: true,
    });
    expect(sample(unsampled)).toBe(SamplingDecision.NOT_RECORD);
  });

  it('returns promptly when shutdown fails', async () => {
    const { options, runtime } = fixture();
    vi.mocked(runtime.shutdown).mockRejectedValue(new Error('private endpoint'));
    const controller = createTelemetryController();
    controller.init(options);
    expect(await controller.shutdown()).toBe(false);
  });

  it('bounds shutdown and reuses pending shutdown rather than calling it twice', async () => {
    vi.useFakeTimers();
    try {
      const { options, runtime } = fixture();
      let finish: (() => void) | undefined;
      vi.mocked(runtime.shutdown).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
      const controller = createTelemetryController();
      controller.init(options);
      const pending = controller.shutdown(100);
      await vi.advanceTimersByTimeAsync(100);
      expect(await pending).toBe(false);
      finish?.();
      expect(await controller.shutdown(100)).toBe(true);
      expect(runtime.shutdown).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
