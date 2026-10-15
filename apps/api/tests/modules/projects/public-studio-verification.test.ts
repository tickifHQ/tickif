import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ states: vi.fn() }));
vi.mock('../../../src/modules/projects/repository.js', () => ({
  projectsRepository: { findPublicStudioVerification: mock.states },
}));
import { withPublicStudioVerification } from '../../../src/modules/projects/public-studio-verification.js';

describe('public studio verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.states.mockResolvedValue(new Map());
  });
  it('batches one current lookup and preserves only confirmed verified states', async () => {
    mock.states.mockResolvedValue(
      new Map([
        ['one', true],
        ['two', false],
      ]),
    );
    expect(
      await withPublicStudioVerification([
        { id: 'one' },
        { id: 'two' },
        { id: 'missing', studioIsVerified: true },
      ]),
    ).toEqual([
      { id: 'one', studioIsVerified: true },
      { id: 'two', studioIsVerified: false },
      { id: 'missing', studioIsVerified: false },
    ]);
    expect(mock.states).toHaveBeenCalledExactlyOnceWith(['one', 'two', 'missing']);
  });
  it('fails closed without blanking cards or keeping a stale verification claim', async () => {
    mock.states.mockRejectedValue(new Error('Unavailable'));
    expect(await withPublicStudioVerification([{ id: 'one', studioIsVerified: true }])).toEqual([
      { id: 'one', studioIsVerified: false },
    ]);
  });
  it('does no work for an empty page', async () => {
    expect(await withPublicStudioVerification([])).toEqual([]);
    expect(mock.states).not.toHaveBeenCalled();
  });
});
