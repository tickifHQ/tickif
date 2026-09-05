import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
  options: {} as Record<string, unknown>,
}));
vi.mock('pg', () => ({
  Pool: class {
    constructor(options: Record<string, unknown>) {
      mocks.options = options;
    }
    query = mocks.query;
    end = mocks.end;
    on = mocks.on;
  },
}));
import { closeReadinessDatabase, isDatabaseReady } from '../src/readiness.js';

beforeEach(() => {
  mocks.query.mockReset();
  mocks.end.mockReset();
});

describe('bounded Postgres readiness', () => {
  it('uses an isolated single connection with connect and query deadlines below the probe budget', () => {
    expect(mocks.options).toMatchObject({
      max: 1,
      connectionTimeoutMillis: 750,
      statement_timeout: 750,
      query_timeout: 750,
    });
    expect(mocks.on).toHaveBeenCalledWith('error', expect.any(Function));
  });
  it('returns only availability for success, bad credentials and connection/query timeouts', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    await expect(isDatabaseReady()).resolves.toBe(true);
    for (const message of [
      'password authentication failed synthetic-secret',
      'Connection timeout',
      'Query read timeout',
    ]) {
      mocks.query.mockRejectedValueOnce(new Error(message));
      await expect(isDatabaseReady()).resolves.toBe(false);
    }
  });
  it('shares an active probe without adding queued connections and closes its pool', async () => {
    let complete: (value: unknown) => void = () => undefined;
    mocks.query.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const first = isDatabaseReady();
    const second = isDatabaseReady();
    expect(mocks.query).toHaveBeenCalledTimes(1);
    complete({ rows: [] });
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    await closeReadinessDatabase();
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });
});
