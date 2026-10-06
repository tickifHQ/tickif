import { describe, expect, it } from 'vitest';
import { getLogContext, runWithLogContext } from '../src/server.js';

describe('request/job context', () => {
  it('isolates overlapping asynchronous operations and inherits nested context', async () => {
    let release: () => void = () => undefined;
    const rendezvous = new Promise<void>((resolve) => { release = resolve; });
    const first = runWithLogContext({ requestId: 'first', token: 'do-not-export' }, async () => {
      await rendezvous;
      expect(getLogContext()).toEqual({ requestId: 'first' });
      return runWithLogContext({ component: 'search' }, () => getLogContext());
    });
    const second = runWithLogContext({ requestId: 'second' }, async () => {
      expect(getLogContext()).toEqual({ requestId: 'second' });
      release();
      await Promise.resolve();
      expect(getLogContext()).toEqual({ requestId: 'second' });
    });
    const [nested] = await Promise.all([first, second]);
    expect(nested).toEqual({ requestId: 'first', component: 'search' });
    expect(getLogContext()).toEqual({});
  });
});
