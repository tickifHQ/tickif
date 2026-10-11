import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadProjectImage } from '../../src/lib/upload-project-image';

describe('uploadProjectImage', () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup(status: number) {
    const request = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn(),
      status,
      upload: { onprogress: null as null | ((event: ProgressEvent) => void) },
      onload: null as null | (() => void),
      onerror: null as null | (() => void),
      onabort: null as null | (() => void),
      ontimeout: null as null | (() => void),
    };
    vi.stubGlobal(
      'XMLHttpRequest',
      class {
        constructor() {
          return request;
        }
      },
    );
    return request;
  }

  it('reports byte progress and resolves only after a successful storage response', async () => {
    const request = setup(200);
    const progress = vi.fn();
    const file = new File(['photo'], 'room.jpg', { type: 'image/jpeg' });
    const result = uploadProjectImage('https://storage.example/upload', file, progress);
    request.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 5 } as ProgressEvent);
    expect(progress.mock.calls).toEqual([[0], [40]]);
    request.onload?.();
    await expect(result).resolves.toBeUndefined();
    expect(progress).toHaveBeenLastCalledWith(100);
    expect(request.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(request.send).toHaveBeenCalledWith(file);
  });

  it.each(['onload', 'onerror', 'onabort', 'ontimeout'] as const)(
    'rejects %s failures for tile recovery',
    async (event) => {
      const request = setup(403);
      const result = uploadProjectImage(
        'https://storage.example/upload',
        new File(['photo'], 'room.jpg'),
        vi.fn(),
      );
      const assertion = expect(result).rejects.toThrow('Could not upload room.jpg.');
      request[event]?.();
      await assertion;
    },
  );
});
