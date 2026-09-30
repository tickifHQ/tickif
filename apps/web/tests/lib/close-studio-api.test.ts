import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStudioRetention, requestStudioClosure, restoreStudio } from '@/lib/close-studio-api';

const mock = vi.hoisted(() => ({ get: vi.fn(), close: vi.fn(), restore: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: { api: { orgs: { retention: {
    $get: mock.get, deletion: { $post: mock.close }, restore: { $post: mock.restore },
  } } } },
}));

describe('close studio API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('reads the active organization retention', async () => {
    mock.get.mockResolvedValue(Response.json({ retention: null }));
    await expect(fetchStudioRetention()).resolves.toEqual({ retention: null });
  });

  it('sends the explicit slug confirmation', async () => {
    mock.close.mockResolvedValue(Response.json({ retention: null }));
    await requestStudioClosure('my-studio');
    expect(mock.close).toHaveBeenCalledWith({ json: { confirmationSlug: 'my-studio' } });
  });

  it('restores the active organization', async () => {
    mock.restore.mockResolvedValue(Response.json({ retention: null }));
    await expect(restoreStudio()).resolves.toEqual({ retention: null });
    expect(mock.restore).toHaveBeenCalledOnce();
  });

  it.each([
    [fetchStudioRetention, mock.get],
    [() => requestStudioClosure('my-studio'), mock.close],
    [restoreStudio, mock.restore],
  ])('rejects invalid success payloads and preserves server errors', async (operation, request) => {
    request.mockResolvedValueOnce(Response.json({ retention: {} }));
    await expect(operation()).rejects.toThrow('invalid');
    request.mockResolvedValueOnce(Response.json({ error: { message: 'Owner permission required' } }, { status: 403 }));
    await expect(operation()).rejects.toThrow('Owner permission required');
  });
});
