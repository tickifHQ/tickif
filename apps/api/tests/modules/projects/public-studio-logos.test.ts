import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ keys: vi.fn(), sign: vi.fn() }));
vi.mock('../../../src/modules/projects/repository.js', () => ({
  projectsRepository: {
    findPublicStudioLogoKeys: mock.keys,
    findPublicStudioVerification: vi.fn(async () => new Map()),
  },
}));
vi.mock('@repo/storage', () => ({ presignDownload: mock.sign }));
import { withPublicStudioLogos } from '../../../src/modules/projects/public-studio-logos.js';
const one = '11111111-1111-4111-8111-111111111111';
const two = '22222222-2222-4222-8222-222222222222';
const missing = '33333333-3333-4333-8333-333333333333';

describe('public studio logo projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.keys.mockResolvedValue(new Map());
    mock.sign.mockImplementation(
      async ({ key }: { key: string }) => `https://media.example/${key}`,
    );
  });
  it('batches project lookup and signs a shared logo once', async () => {
    mock.keys.mockResolvedValue(
      new Map([
        [one, 'logo.png'],
        [two, 'logo.png'],
      ]),
    );
    expect(await withPublicStudioLogos([{ id: one }, { id: two }, { id: missing }])).toEqual([
      { id: one, studioLogoUrl: 'https://media.example/logo.png', studioIsVerified: false },
      { id: two, studioLogoUrl: 'https://media.example/logo.png', studioIsVerified: false },
      { id: missing, studioLogoUrl: null, studioIsVerified: false },
    ]);
    expect(mock.keys).toHaveBeenCalledWith([one, two, missing]);
    expect(mock.sign).toHaveBeenCalledOnce();
  });
  it('does no work for an empty page', async () => {
    expect(await withPublicStudioLogos([])).toEqual([]);
    expect(mock.keys).not.toHaveBeenCalled();
  });
  it('keeps cards available when logo signing fails', async () => {
    mock.keys.mockResolvedValue(new Map([[one, 'logo.png']]));
    mock.sign.mockRejectedValue(new Error('Storage unavailable'));
    expect(await withPublicStudioLogos([{ id: one }])).toEqual([
      { id: one, studioLogoUrl: null, studioIsVerified: false },
    ]);
  });
  it('keeps search cards available when optional logo lookup fails', async () => {
    mock.keys.mockRejectedValue(new Error('Database unavailable'));
    expect(await withPublicStudioLogos([{ id: one }])).toEqual([
      { id: one, studioLogoUrl: null, studioIsVerified: false },
    ]);
  });
});
