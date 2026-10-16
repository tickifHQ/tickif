import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { locationsRoutes } from '../../../src/modules/taxonomy/locations-routes.js';
import { AppError, onError } from '../../../src/lib/errors.js';
const mock = vi.hoisted(() => ({ nearby: vi.fn() }));
vi.mock('../../../src/modules/taxonomy/nearby-service.js', () => ({
  findNearbyLocation: mock.nearby,
}));
vi.mock('../../../src/modules/taxonomy/locations-service.js', () => ({
  locationsService: { create: vi.fn() },
}));
const app = new OpenAPIHono().onError(onError).route('/api/taxonomy', locationsRoutes);
const city = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Vapi',
  slug: 'vapi',
  parentId: null,
};
const request = (input: unknown) =>
  app.request('/api/taxonomy/locations/nearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mock.nearby.mockResolvedValue({ city });
});
describe('POST nearby location', () => {
  it('accepts unauthenticated visitors and never caches the detected city', async () => {
    const response = await request({ latitude: 20.37, longitude: 72.9 });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ city });
  });
  it('rejects invalid coordinates before using provider quota', async () => {
    expect((await request({ latitude: 120, longitude: 72.9 })).status).toBe(422);
    expect(mock.nearby).not.toHaveBeenCalled();
  });
  it('returns a useful, noncached provider-unavailable response', async () => {
    mock.nearby.mockRejectedValue(
      new AppError('nearby_unavailable', 'Choose a city instead.', 503),
    );
    const response = await request({ latitude: 20.37, longitude: 72.9 });
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
