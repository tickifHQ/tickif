import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ProfileCompletionResponse, ProfileDashboardResponse } from '@repo/contracts';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  headers: vi.fn(),
  dashboardGet: vi.fn(),
  projectsGet: vi.fn(),
  getCurrentDesignerProfile: vi.fn(),
  getProfileCompletion: vi.fn(),
  getCurrentOrgCapabilities: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/auth-guard', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      profiles: { me: { dashboard: { $get: mocks.dashboardGet } } },
      projects: { $get: mocks.projectsGet },
    },
  },
}));
vi.mock('@/lib/designer-profile', () => ({
  getCurrentDesignerProfile: mocks.getCurrentDesignerProfile,
  getProfileCompletion: mocks.getProfileCompletion,
}));
vi.mock('@/lib/current-org-role', () => ({
  getCurrentOrgCapabilities: mocks.getCurrentOrgCapabilities,
}));

import DesignerDashboardPage from '../../../../app/(designer)/designer/dashboard/page';

const dashboard: ProfileDashboardResponse = {
  profileCompletion: { score: 100, missing: [] },
  projects: { total: 2, published: 1, inReview: 1, draft: 0 },
  leads: { total: 3, new: 1 },
  shareUrl: 'https://tickif.com/d/studio',
  heroCoverUrl: null,
  publiclyVisible: true,
  portfolioBasicsComplete: true,
  verificationStatus: 'verified',
};

const completion: ProfileCompletionResponse = {
  score: 100,
  missing: [],
  steps: [
    { key: 'signed-in-with-google', label: 'Sign in with Google', done: true },
    { key: 'org-created', label: 'Create your organization', done: true },
    { key: 'profile-completed', label: 'Complete your profile', done: true },
    { key: 'first-project-uploaded', label: 'Upload your first project', done: true },
  ],
};

describe('DesignerDashboardPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.sessionStorage.clear();
    mocks.headers.mockResolvedValue(new Headers({ cookie: 'session=local-test' }));
    mocks.requireAuth.mockResolvedValue({
      user: { name: 'Test studio' },
      session: { activeTeamId: null },
    });
    mocks.getCurrentDesignerProfile.mockResolvedValue(null);
    mocks.getProfileCompletion.mockResolvedValue({ data: completion });
    mocks.getCurrentOrgCapabilities.mockResolvedValue({
      writeProjects: true,
      editOrganization: true,
      manageVerification: true,
    });
    mocks.dashboardGet.mockResolvedValue({ ok: true, json: async () => dashboard });
    mocks.projectsGet.mockResolvedValue({ ok: false });
  });

  it.each(['non-OK', 'invalid payload', 'invalid JSON', 'network failure', 'missing cookie'])(
    'shows only recovery when the summary fails (%s), even with completed setup',
    async (failure) => {
      if (failure === 'non-OK') mocks.dashboardGet.mockResolvedValue({ ok: false });
      if (failure === 'invalid payload')
        mocks.dashboardGet.mockResolvedValue({ ok: true, json: async () => ({ projects: {} }) });
      if (failure === 'invalid JSON')
        mocks.dashboardGet.mockResolvedValue({
          ok: true,
          json: async () => {
            throw new SyntaxError('Invalid JSON');
          },
        });
      if (failure === 'network failure') mocks.dashboardGet.mockRejectedValue(new Error('Offline'));
      if (failure === 'missing cookie') mocks.headers.mockResolvedValue(new Headers());

      render(await DesignerDashboardPage());

      expect(screen.getByRole('alert')).toHaveTextContent('Could not load dashboard summary');
      expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
      expect(screen.queryByTestId('post-setup-overview')).not.toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /copy link/i })).not.toBeInTheDocument();
      expect(screen.queryByText('Total projects')).not.toBeInTheDocument();
      if (failure === 'missing cookie') expect(mocks.dashboardGet).not.toHaveBeenCalled();
    },
  );

  it('keeps a successful completed overview when only recent projects fail', async () => {
    render(await DesignerDashboardPage());

    expect(screen.getByTestId('post-setup-overview')).toBeVisible();
    expect(screen.getByText('Recent projects could not be loaded.')).toBeVisible();
    expect(screen.queryByText('Could not load dashboard summary')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeVisible();
    expect(mocks.requireAuth).toHaveBeenCalledWith({ requiredRole: 'designer' });
    expect(mocks.dashboardGet).toHaveBeenCalledWith(
      {},
      { headers: { cookie: 'session=local-test' } },
    );
  });

  it('does not trust completion alone when the successfully loaded portfolio basics are incomplete', async () => {
    mocks.dashboardGet.mockResolvedValue({
      ok: true,
      json: async () => ({ ...dashboard, portfolioBasicsComplete: false, publiclyVisible: false }),
    });
    render(await DesignerDashboardPage());

    expect(screen.getByRole('progressbar', { name: 'Portfolio setup' })).toBeVisible();
    expect(screen.queryByTestId('post-setup-overview')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('fails closed for editing when capabilities are unavailable', async () => {
    mocks.dashboardGet.mockResolvedValue({ ok: false });
    mocks.getCurrentOrgCapabilities.mockResolvedValue(null);
    render(await DesignerDashboardPage());

    expect(screen.getByRole('link', { name: 'View projects' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Add project' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage portfolio' })).not.toBeInTheDocument();
  });
});
