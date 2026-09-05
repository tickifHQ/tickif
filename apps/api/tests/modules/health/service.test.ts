import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/modules/health/repository.js', () => ({
  postgresIsReady: vi.fn(),
}));

import * as repository from '../../../src/modules/health/repository.js';
import { beginDraining, getReadiness, setDraining } from '../../../src/modules/health/service.js';

const postgresIsReady = vi.mocked(repository.postgresIsReady);

describe('API readiness', () => {
  beforeEach(() => {
    setDraining(false);
    postgresIsReady.mockReset();
  });

  it('is ready only when Postgres is reachable', async () => {
    postgresIsReady.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(getReadiness()).resolves.toMatchObject({
      ready: true,
      body: { status: 'ready', checks: { postgres: 'up' } },
    });
    await expect(getReadiness()).resolves.toMatchObject({
      ready: false,
      body: { status: 'not-ready', checks: { postgres: 'down' } },
    });
  });

  it('fails readiness immediately while draining without probing Postgres', async () => {
    beginDraining();

    await expect(getReadiness()).resolves.toMatchObject({
      ready: false,
      body: { status: 'draining' },
    });
    expect(postgresIsReady).not.toHaveBeenCalled();
  });
});
