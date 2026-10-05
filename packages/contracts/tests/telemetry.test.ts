import { describe, expect, it } from 'vitest';
import { telemetryLogsRequestSchema } from '../src/telemetry';

const event = { level: 'error', event: 'client.unhandled', message: 'Unexpected failure', timestamp: '2026-10-05T10:00:00.000Z' };

describe('browser telemetry contracts', () => {
  it('accepts bounded anonymous warning/error events', () => {
    expect(telemetryLogsRequestSchema.safeParse({ events: [{ ...event, page: '/home/settings', attributes: { component: 'Settings' } }] }).success).toBe(true);
  });

  it.each([
    { ...event, userId: 'claimed-user' },
    { ...event, service: 'tickif-api' },
    { ...event, trace_id: 'claimed-trace' },
    { ...event, attributes: { token: 'secret' } },
    { ...event, error: { name: 'Error', message: 'failed', payload: {} } },
    { ...event, level: 'debug' },
    { ...event, timestamp: 'yesterday' },
    { ...event, event: 'event\nforged' },
    { ...event, page: '/login?token=secret' },
    { ...event, page: '//external.example/path' },
    { ...event, message: 'x'.repeat(1_001) },
  ])('rejects unknown, unsafe or oversized fields', (invalid) => {
    expect(telemetryLogsRequestSchema.safeParse({ events: [invalid] }).success).toBe(false);
  });

  it('rejects empty and oversized batches', () => {
    expect(telemetryLogsRequestSchema.safeParse({ events: [] }).success).toBe(false);
    expect(telemetryLogsRequestSchema.safeParse({ events: Array.from({ length: 21 }, () => event) }).success).toBe(false);
  });
});
