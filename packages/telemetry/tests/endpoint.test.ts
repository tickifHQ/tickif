import { describe, expect, it } from 'vitest';
import { signalEndpoint } from '../src/endpoint.js';

describe('OTLP signal destinations', () => {
  it.each(['http://collector:4318', 'http://collector:4318/', 'http://collector:4318///'])(
    'appends the signal path to %s',
    (base) => {
      expect(signalEndpoint(base, 'traces')).toBe('http://collector:4318/v1/traces');
      expect(signalEndpoint(base, 'metrics')).toBe('http://collector:4318/v1/metrics');
    },
  );

  it('preserves prefixes and internal separators while trimming trailing separators', () => {
    expect(signalEndpoint('https://collector/prefix//nested///', 'traces')).toBe(
      'https://collector/prefix//nested/v1/traces',
    );
  });

  it('handles long internal and trailing separator runs without altering the prefix', () => {
    const internal = `https://collector/${'/'.repeat(100_000)}prefix`;
    expect(signalEndpoint(internal, 'traces')).toBe(`${internal}/v1/traces`);
    expect(signalEndpoint(`https://collector/prefix${'/'.repeat(100_000)}`, 'metrics')).toBe(
      'https://collector/prefix/v1/metrics',
    );
  });
});
