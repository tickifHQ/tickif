import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectEngagement } from '@repo/contracts';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ api: { api: { interactions: { projects: { $get: get } } } } }));
const { ProjectViewCount } = await import('@/components/project-view-count');
const { refreshProjectEngagement } = await import('@/lib/project-engagement');
const projectId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const response = (projects: ProjectEngagement[]) => ({
  ok: true,
  json: async () => ({ projects }),
});
beforeEach(() => {
  get.mockReset();
});

describe('ProjectViewCount', () => {
  it('batches duplicate cards and renders a passive eye/count without a login action', async () => {
    get.mockResolvedValue(response([{ projectId, viewCount: 1234, saveCount: 4 }]));
    render(
      <>
        <ProjectViewCount projectId={projectId} />
        <ProjectViewCount projectId={projectId} />
      </>,
    );
    expect(await screen.findAllByRole('img', { name: '1,234 project views' })).toHaveLength(2);
    expect(document.querySelectorAll('.lucide-eye')).toHaveLength(2);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith({ query: { projectIds: [projectId] } });
  });

  it('does not fabricate zero when a response fails', async () => {
    get.mockRejectedValue(new Error('offline'));
    render(<ProjectViewCount projectId={projectId} />);
    expect(await screen.findByRole('img', { name: 'Project views unavailable' })).toHaveTextContent(
      '—',
    );
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders a real zero and refreshes after a recorded visit', async () => {
    get
      .mockResolvedValueOnce(response([{ projectId, viewCount: 0, saveCount: 0 }]))
      .mockResolvedValueOnce(response([{ projectId, viewCount: 1, saveCount: 0 }]));
    render(<ProjectViewCount projectId={projectId} />);
    expect(await screen.findByRole('img', { name: '0 project views' })).toHaveTextContent('0');
    act(() => refreshProjectEngagement(projectId));
    expect(await screen.findByRole('img', { name: '1 project view' })).toHaveTextContent('1');
  });

  it('ignores a stale read that finishes after the post-view refresh', async () => {
    let resolveOld: ((value: ReturnType<typeof response>) => void) | undefined;
    get
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(response([{ projectId, viewCount: 6, saveCount: 0 }]));
    render(<ProjectViewCount projectId={projectId} />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    act(() => refreshProjectEngagement(projectId));
    await screen.findByRole('img', { name: '6 project views' });
    await act(async () => resolveOld?.(response([{ projectId, viewCount: 5, saveCount: 0 }])));
    expect(screen.getByRole('img', { name: '6 project views' })).toBeInTheDocument();
  });

  it('clears the previous project count when navigating', async () => {
    get
      .mockResolvedValueOnce(response([{ projectId, viewCount: 8, saveCount: 0 }]))
      .mockResolvedValueOnce(response([{ projectId: otherId, viewCount: 2, saveCount: 0 }]));
    const view = render(<ProjectViewCount projectId={projectId} />);
    await screen.findByRole('img', { name: '8 project views' });
    view.rerender(<ProjectViewCount projectId={otherId} />);
    expect(screen.queryByRole('img', { name: '8 project views' })).not.toBeInTheDocument();
    await screen.findByRole('img', { name: '2 project views' });
  });

  it('splits large grids into bounded requests', async () => {
    const ids = Array.from(
      { length: 49 },
      (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
    );
    get.mockImplementation(async ({ query }: { query: { projectIds: string[] } }) =>
      response(query.projectIds.map((id) => ({ projectId: id, viewCount: 0, saveCount: 0 }))),
    );
    render(
      <>
        {ids.map((id) => (
          <ProjectViewCount key={id} projectId={id} />
        ))}
      </>,
    );
    expect(await screen.findAllByRole('img', { name: '0 project views' })).toHaveLength(49);
    expect(get.mock.calls.map((call) => call[0].query.projectIds.length)).toEqual([48, 1]);
  });
});
