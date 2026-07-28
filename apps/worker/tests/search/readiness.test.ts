import { describe, expect, it, vi } from 'vitest';
import { probeSearchReadiness } from '../../src/search/readiness.js';

describe('search readiness probe', () => {
  it('reports the Typesense health result', async () => {
    await expect(probeSearchReadiness(vi.fn(async () => ({ ok: true })))).resolves.toBe(true);
    await expect(probeSearchReadiness(vi.fn(async () => ({ ok: false })))).resolves.toBe(false);
  });

  it('degrades readiness instead of throwing when Typesense is unavailable', async () => {
    await expect(
      probeSearchReadiness(
        vi.fn(async () => {
          throw new Error('connection refused');
        }),
      ),
    ).resolves.toBe(false);
  });
});
