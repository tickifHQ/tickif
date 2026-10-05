import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePublicProject } from '../../fixtures/public-project';

const mock = vi.hoisted(() => ({ project: vi.fn(), image: vi.fn(), render: vi.fn() }));
vi.mock('@/lib/public-project-api', () => ({
  fetchPublicProject: mock.project,
  isUnavailableProject: (project: { availability?: string }) =>
    project.availability === 'unavailable',
}));
vi.mock('@/lib/social-image', () => ({
  socialImageData: mock.image,
  SOCIAL_IMAGE_HEADERS: { 'Cache-Control': 'private, no-store, max-age=0' },
}));
vi.mock('next/og', () => ({
  ImageResponse: class extends Response {
    constructor(element: unknown, options: ResponseInit) {
      super('PNG', options);
      mock.render(element, options);
    }
  },
}));
const { GET } = await import('../../../app/(public)/projects/[id]/social-card/route');
const request = () =>
  GET(new Request('http://localhost/projects/project/social-card'), {
    params: Promise.resolve({ id: 'project' }),
  });

describe('project social image availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.image.mockResolvedValue(null);
  });
  it('uses the public published response and disables stale visibility caching', async () => {
    mock.project.mockResolvedValue(makePublicProject());
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mock.render).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          title: 'Traditional Meets Modern',
          studio: 'Anika Spaces',
          image: null,
        }),
      }),
      expect.objectContaining({ width: 1200, height: 630 }),
    );
  });
  it.each([null, { availability: 'unavailable', title: 'Private former project' }])(
    'returns 404 and never fetches media for unavailable content',
    async (project) => {
      mock.project.mockResolvedValue(project);
      expect((await request()).status).toBe(404);
      expect(mock.image).not.toHaveBeenCalled();
      expect(mock.render).not.toHaveBeenCalled();
    },
  );
  it('rechecks visibility after an earlier successful image', async () => {
    mock.project.mockResolvedValueOnce(makePublicProject()).mockResolvedValueOnce(null);
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(404);
  });
});
