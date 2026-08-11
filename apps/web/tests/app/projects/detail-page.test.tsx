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
  PublicProjectOverview: ({ project }: { project: { title: string } }) => (
    <div data-testid="project-overview">{project.title}</div>
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

  it('generates metadata for the canonical id-based URL', async () => {
    const project = makePublicProject();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(response(project));

    const metadata = await generateMetadata({ params: Promise.resolve({ id: project.id }) });

    expect(metadata.title).toBe(`${project.title} | Tickif`);
    expect(metadata.alternates?.canonical).toBe(`http://localhost:3000/projects/${project.id}`);
    expect(metadata.openGraph?.images).toEqual([project.coverImageUrl]);
  });
});
