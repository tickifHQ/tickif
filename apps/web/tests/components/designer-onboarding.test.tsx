import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DesignerOnboarding } from '../../src/components/designer-onboarding';

const mock = vi.hoisted(() => ({
  router: { push: vi.fn() },
  signOut: vi.fn(),
  taxonomyGet: vi.fn(),
}));

const taxonomyFixtures = {
  scope: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      label: 'Full Home Interiors',
      slug: 'full-home-interiors',
      parentId: null,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      label: 'Modular Kitchen',
      slug: 'modular-kitchen',
      parentId: null,
    },
  ],
  theme: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      label: 'Modern',
      slug: 'modern',
      parentId: null,
    },
  ],
};

vi.mock('next/navigation', () => ({
  useRouter: () => mock.router,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signOut: mock.signOut,
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      taxonomy: {
        terms: {
          $get: mock.taxonomyGet,
        },
      },
    },
  },
}));

describe('DesignerOnboarding', () => {
  beforeEach(() => {
    mock.router.push.mockClear();
    mock.signOut.mockClear();
    mock.signOut.mockResolvedValue(undefined);
    mock.taxonomyGet.mockReset();
    mock.taxonomyGet.mockImplementation(async ({ query }: { query: { kind?: keyof typeof taxonomyFixtures } }) => ({
      ok: true,
      json: async () => ({ terms: query.kind ? taxonomyFixtures[query.kind] : [] }),
    }));
    window.history.pushState({}, '', '/designer/onboarding');
  });

  it('renders the onboarding shell with signed-in context and entity options', () => {
    render(<DesignerOnboarding signedInAs="mahi@test.com" />);

    expect(screen.getByText(/Signed in as/i)).toBeInTheDocument();
    expect(screen.getByText('mahi@test.com')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /set up your space/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /just me/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /interior company \(firm\)/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
  });

  it('signs out to the login screen when backing from the entity selection screen', async () => {
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="mahi@test.com" />);

    await user.click(screen.getByRole('button', { name: /signed in as mahi@test\.com/i }));

    expect(mock.signOut).toHaveBeenCalled();
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toBe('?mode=designer');
    expect(mock.router.push).not.toHaveBeenCalled();
  });

  it('moves to the details form after selecting a listing type', async () => {
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="mahi@test.com" />);

    expect(screen.queryByLabelText(/company name/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /interior company \(firm\)/i }));

    expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('renders generated initials avatars for individual and company details', async () => {
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="Sarthak Wade" signedInName="Sarthak Wade" />);

    await user.click(screen.getByRole('button', { name: /just me/i }));

    const profileAvatar = screen.getByRole('img', { name: /generated profile initials/i });
    expect(profileAvatar).toHaveAttribute('src', expect.stringContaining('data:image/svg+xml'));

    await user.click(screen.getByRole('button', { name: /signed in as sarthak wade/i }));
    await user.click(screen.getByRole('button', { name: /interior company \(firm\)/i }));
    await user.type(screen.getByLabelText(/company name/i), 'Sarthak Interiors');

    const companyAvatar = screen.getByRole('img', { name: /generated company logo initials/i });
    expect(companyAvatar).toHaveAttribute('src', expect.stringContaining('data:image/svg+xml'));
    expect(decodeURIComponent(companyAvatar.getAttribute('src') ?? '')).toContain('SI');
  });

  it('returns from socials to details instead of entity', async () => {
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="mahi@test.com" />);

    await user.click(screen.getByRole('button', { name: /just me/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Mahi Studio');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText(/website/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /signed in as mahi@test\.com/i }));

    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/address/i)).toBeInTheDocument();
    expect(mock.signOut).not.toHaveBeenCalled();
    expect(mock.router.push).not.toHaveBeenCalled();
  });

  it('returns from completion to socials instead of leaving onboarding', async () => {
    const submit = vi.fn().mockResolvedValue({
      created: true,
      data: {
        profile: {
          id: '11111111-1111-4111-8111-111111111111',
          orgId: 'org-1',
          displayName: 'Mahi Studio',
          entityType: 'individual',
          status: 'draft',
          createdAt: '2026-06-18T00:00:00.000Z',
        },
        organization: {
          id: 'org-1',
          name: 'Mahi Studio',
          slug: 'mahi-studio',
        },
      },
    });
    const user = userEvent.setup();

    render(<DesignerOnboarding signedInAs="mahi@test.com" onSubmitOnboarding={submit} />);

    await user.click(screen.getByRole('button', { name: /just me/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Mahi Studio');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(/You're set up, there/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /signed in as mahi@test\.com/i }));

    expect(screen.getByLabelText(/website/i)).toBeInTheDocument();
    expect(screen.queryByText(/You're set up, there/i)).not.toBeInTheDocument();
    expect(mock.router.push).not.toHaveBeenCalled();
  });

  it('opens project upload from the completion add-projects CTA', async () => {
    const submit = vi.fn().mockResolvedValue({
      created: true,
      data: {
        profile: {
          id: '11111111-1111-4111-8111-111111111111',
          orgId: 'org-1',
          displayName: 'Mahi Studio',
          entityType: 'individual',
          status: 'draft',
          createdAt: '2026-06-18T00:00:00.000Z',
        },
        organization: {
          id: 'org-1',
          name: 'Mahi Studio',
          slug: 'mahi-studio',
        },
      },
    });
    const user = userEvent.setup();

    render(<DesignerOnboarding signedInAs="mahi@test.com" onSubmitOnboarding={submit} />);

    await user.click(screen.getByRole('button', { name: /just me/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Mahi Studio');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /add your projects/i }));

    expect(mock.router.push).toHaveBeenCalledWith('/designer/projects/upload');
  });

  it('walks through the company flow, submits the supported payload, and shows completion', async () => {
    const submit = vi.fn().mockResolvedValue({
      created: true,
      data: {
        profile: {
          id: '11111111-1111-4111-8111-111111111111',
          orgId: 'org-1',
          displayName: 'Antika Interiors',
          entityType: 'company',
          status: 'draft',
          createdAt: '2026-06-18T00:00:00.000Z',
        },
        organization: {
          id: 'org-1',
          name: 'Antika Interiors',
          slug: 'antika-interiors',
        },
      },
    });
    const user = userEvent.setup();

    render(<DesignerOnboarding signedInAs="mahi@test.com" onSubmitOnboarding={submit} />);

    await user.click(screen.getByRole('button', { name: /interior company \(firm\)/i }));
    await user.type(screen.getByLabelText(/company name/i), 'Antika Interiors');
    expect(screen.getByLabelText(/firm type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip to dashboard/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/address/i), '12 Studio Lane, Chennai');

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText(/whatsapp number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/website/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/google business/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText(/services offered/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/design themes/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/founded/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/team size/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/services offered/i));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /full home interiors/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /modular kitchen/i }));
    const servicesSelect = screen.getByLabelText(/services offered/i);
    expect(servicesSelect).toHaveTextContent(
      /Full Home Interiors, Modular Kitchen/i,
    );
    await user.keyboard('{Escape}');

    await user.click(screen.getByLabelText(/design themes/i));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /modern/i }));
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith({
        entityType: 'company',
        userName: 'Antika Interiors',
        companyName: 'Antika Interiors',
        address: '12 Studio Lane, Chennai',
        scopeIds: [
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
        ],
        themeIds: ['44444444-4444-4444-8444-444444444444'],
        firmType: 'Private Limited',
        foundedYear: 2021,
        staffCount: 10,
      });
    });
    expect(await screen.findByText(/You're set up, there/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add your projects/i })).toBeInTheDocument();
  });

  it('normalizes a bare domain to https:// before submit', async () => {
    const submit = vi.fn().mockResolvedValue({
      created: true,
      data: {
        profile: {
          id: '11111111-1111-4111-8111-111111111111',
          orgId: 'org-1',
          displayName: 'Mahi Studio',
          entityType: 'individual',
          status: 'draft',
          createdAt: '2026-06-18T00:00:00.000Z',
        },
        organization: { id: 'org-1', name: 'Mahi Studio', slug: 'mahi-studio' },
      },
    });
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="mahi@test.com" onSubmitOnboarding={submit} />);

    await user.click(screen.getByRole('button', { name: /just me/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Mahi Studio');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText(/website/i), 'mystudio.com');

    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          websiteUrl: 'https://mystudio.com',
        }),
      );
    });
  });

  it('omits short phone numbers from the submit payload', async () => {
    const submit = vi.fn().mockResolvedValue({
      created: true,
      data: {
        profile: {
          id: '11111111-1111-4111-8111-111111111111',
          orgId: 'org-1',
          displayName: 'Mahi Studio',
          entityType: 'individual',
          status: 'draft',
          createdAt: '2026-06-18T00:00:00.000Z',
        },
        organization: { id: 'org-1', name: 'Mahi Studio', slug: 'mahi-studio' },
      },
    });
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="mahi@test.com" onSubmitOnboarding={submit} />);

    await user.click(screen.getByRole('button', { name: /just me/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Mahi Studio');
    await user.type(screen.getByLabelText(/whatsapp number/i), '123');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith(
        expect.not.objectContaining({ phone: expect.any(String) }),
      );
    });
  });

  it('surfaces API errors inline', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('Google SSO required for designer onboarding'));
    const user = userEvent.setup();

    render(<DesignerOnboarding signedInAs="mahi@test.com" onSubmitOnboarding={submit} />);

    await user.click(screen.getByRole('button', { name: /just me/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Mahi Studio');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText(/website/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/google business/i)).toBeInTheDocument();
    expect(screen.getByText(/social links/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(/Google SSO required/i)).toBeInTheDocument();
  });
});
