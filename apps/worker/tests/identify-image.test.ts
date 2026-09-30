import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  readImageSignature: vi.fn(),
  signatureToken: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }));
vi.mock('../src/media/signature.js', () => ({
  readImageSignature: mocks.readImageSignature,
  signatureToken: mocks.signatureToken,
}));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  process.exitCode = undefined;
  mocks.readFile.mockResolvedValue(Buffer.from('image'));
  mocks.readImageSignature.mockResolvedValue('recovered-token');
  mocks.signatureToken.mockReturnValue('recovered-token');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe('media:identify', () => {
  it.each([{ prefix: [] }, { prefix: ['--'] }])(
    'accepts the documented optional argument separator $prefix',
    async ({ prefix }) => {
      process.argv = ['node', 'identify-image.ts', ...prefix, 'photo.webp', 'image-id'];

      await import('../src/identify-image.js');

      await vi.waitFor(() => expect(console.log).toHaveBeenCalledWith('Image ID matches.'));
      expect(mocks.readFile).toHaveBeenCalledWith('photo.webp');
      expect(mocks.signatureToken).toHaveBeenCalledWith('image-id');
      expect(process.exitCode).toBeUndefined();
    },
  );

  it('reports a nonzero exit code for a different candidate ID', async () => {
    process.argv = ['node', 'identify-image.ts', 'photo.avif', 'different-id'];
    mocks.signatureToken.mockReturnValue('different-token');

    await import('../src/identify-image.js');

    await vi.waitFor(() => expect(process.exitCode).toBe(1));
    expect(console.log).toHaveBeenCalledWith('Image ID does not match.');
  });

  it('reports a nonzero exit code when a candidate image has no signature', async () => {
    process.argv = ['node', 'identify-image.ts', 'original.jpg', 'image-id'];
    mocks.readImageSignature.mockResolvedValue(null);

    await import('../src/identify-image.js');

    await vi.waitFor(() => expect(process.exitCode).toBe(1));
    expect(console.log).toHaveBeenCalledWith('No Tickif image signature found.');
  });
});
