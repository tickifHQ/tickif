import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePublicProject } from '../../fixtures/public-project';

const mock = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: mock.notFound }));
vi.mock('@/components/public-project-overview', () => ({
  PublicProjectOverview: ({
    project,
    canonicalUrl,
  }: {
    project: { title: string };
    canonicalUrl: string;
  }) => (
    <div data-testid="project-overview" data-canonical-url={canonicalUrl}>
      {project.title}
    </div>
  ),
}));

vi.stubGlobal('fetch', vi.fn());

const { default: ProjectDetailPage, generateMetadata } =
  await import('../../../app/(public)/projects/[id]/page');

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the canonical public model by id and renders the project', async () => {
    const project = makePublicProject();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(response(project));

    render(await ProjectDetailPage({ params: Promise.resolve({ id: project.id }) }));

    expect(screen.getByTestId('project-overview')).toHaveTextContent(project.title);
    expect(screen.getByTestId('project-overview')).toHaveAttribute(
      'data-canonical-url',
      `http://localhost:3000/projects/${project.id}`,
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/projects/public/${project.id}`),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('returns not found for an unknown or ineligible project id', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(response({}, 404));

    await expect(
      ProjectDetailPage({
        params: Promise.resolve({ id: '99999999-9999-4999-8999-999999999999' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders a noindex unavailable notice for a recoverable delisted project', async () => {
    const project = {
      availability: 'unavailable',
      id: '88888888-8888-4888-8888-888888888888',
      title: 'Recoverable Home',
      status: 'delisted',
      designer: { displayName: 'Studio A', slug: 'studio-a' },
    } as const;
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(response(project));

    render(await ProjectDetailPage({ params: Promise.resolve({ id: project.id }) }));

    expect(screen.getByRole('heading', { name: project.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View studio profile' })).toHaveAttribute(
      'href',
      '/d/studio-a',
    );

    const metadata = await generateMetadata({ params: Promise.resolve({ id: project.id }) });
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it('returns not found when the API reports a permanently deleted project', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(response({}, 410));

    await expect(
      ProjectDetailPage({
        params: Promise.resolve({ id: '77777777-7777-4777-8777-777777777777' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it.each([400, 422])(
    'returns not found for a malformed project id rejected with %s',
    async (status) => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(response({}, status));

      await expect(
        ProjectDetailPage({ params: Promise.resolve({ id: 'not-a-project-id' }) }),
      ).rejects.toThrow('NEXT_NOT_FOUND');
    },
  );

  it('generates metadata for the canonical id-based URL', async () => {
    const project = makePublicProject();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(response(project));

    const metadata = await generateMetadata({ params: Promise.resolve({ id: project.id }) });

    expect(metadata.title).toBe(`${project.title} | Tickif`);
    expect(metadata.alternates?.canonical).toBe(`http://localhost:3000/projects/${project.id}`);
    expect(metadata.openGraph).not.toHaveProperty('images');
  });
});
