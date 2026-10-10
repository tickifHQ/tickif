import { StrictMode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { api: { interactions: { views: { $post: mocks.post } } } } }));
vi.mock('@/lib/project-engagement', () => ({ refreshProjectEngagement: mocks.refresh }));
const { ProjectViewTracker } = await import('@/components/project-view-tracker');
const projectId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  mocks.post.mockResolvedValue({ ok: true, json: async () => ({ recorded: true }) });
});

describe('ProjectViewTracker', () => {
  it('records the project visit and refreshes its public count', async () => {
    render(<ProjectViewTracker projectId={projectId} isAuthenticated />);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith(projectId));
    expect(mocks.post).toHaveBeenCalledWith({
      json: {
        type: 'project_view',
        projectId,
        eventKey: expect.any(String),
        anonymousId: window.localStorage.getItem('tickif.anonymousId'),
      },
    });
  });

  it('does not record guests, and starts when authenticated', async () => {
    const view = render(<ProjectViewTracker projectId={projectId} isAuthenticated={false} />);
    expect(mocks.post).not.toHaveBeenCalled();
    view.rerender(<ProjectViewTracker projectId={projectId} isAuthenticated />);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
  });

  it('does not count a background page until visible', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    render(<ProjectViewTracker projectId={projectId} isAuthenticated />);
    expect(mocks.post).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh visit after signing out and signing in on the same project', async () => {
    const view = render(<ProjectViewTracker projectId={projectId} isAuthenticated />);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const firstKey = mocks.post.mock.calls[0]![0].json.eventKey;
    view.rerender(<ProjectViewTracker projectId={projectId} isAuthenticated={false} />);
    view.rerender(<ProjectViewTracker projectId={projectId} isAuthenticated />);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    expect(mocks.post.mock.calls[1]![0].json.eventKey).not.toBe(firstKey);
  });

  it('reuses its event key under Strict Mode and visitor identity across page visits', async () => {
    const view = render(
      <StrictMode>
        <ProjectViewTracker projectId={projectId} isAuthenticated />
      </StrictMode>,
    );
    await waitFor(() => expect(mocks.post.mock.calls.length).toBeGreaterThan(0));
    const payloads = mocks.post.mock.calls.map((call) => call[0].json);
    expect(new Set(payloads.map((payload) => payload.eventKey)).size).toBe(1);
    const initial = payloads[0];
    view.unmount();
    render(<ProjectViewTracker projectId={projectId} isAuthenticated />);
    const latest = mocks.post.mock.calls.at(-1)![0].json;
    expect(latest.anonymousId).toBe(initial.anonymousId);
    expect(latest.eventKey).not.toBe(initial.eventKey);
  });

  it('tolerates storage and network failures without breaking the page', async () => {
    const getItem = vi.spyOn(window.localStorage, 'getItem').mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    mocks.post.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      render(<ProjectViewTracker projectId={projectId} isAuthenticated />);
    });
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
    getItem.mockRestore();
  });
});
