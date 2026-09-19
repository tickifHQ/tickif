import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DesignerOnboarding } from '../../src/components/designer-onboarding';

function deferredSave() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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
      profiles: {
        me: {
          // E-298 draft endpoints. Default: succeed with an empty-ish payload so
          // tests that don't override onSaveDraft/onClearDraft never crash on the
          // module-level default client.
          'onboarding-draft': {
            $get: vi.fn(async () => ({ ok: true, json: async () => ({ draft: null }) })),
            $put: vi.fn(async () => ({
              ok: true,
              json: async () => ({
                step: 'entity',
                fields: {},
                updatedAt: '2026-01-01T00:00:00.000Z',
              }),
            })),
            $delete: vi.fn(async () => ({ ok: true, status: 204 })),
          },
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
    mock.taxonomyGet.mockImplementation(
      async ({ query }: { query: { kind?: keyof typeof taxonomyFixtures } }) => ({
        ok: true,
        json: async () => ({ terms: query.kind ? taxonomyFixtures[query.kind] : [] }),
      }),
    );
    window.history.pushState({}, '', '/designer/onboarding');
  });

  it('renders the onboarding shell with signed-in context and entity options', async () => {
    const { container } = render(<DesignerOnboarding signedInAs="mahi@test.com" />);

    expect(screen.getByText(/Signed in as/i)).toBeInTheDocument();
    expect(screen.getByText('mahi@test.com')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /set up your space/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /just me/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /interior company \(firm\)/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /need help\? contact support/i })).toHaveAttribute(
      'href',
      'mailto:support@tickif.in',
    );
    expect(container.querySelector('img[src*="onboarding-living-room.svg"]')).toHaveAttribute(
      'height',
      '189',
    );
    expect(container.querySelector('img[src*="onboarding-profile-chair.svg"]')).toHaveAttribute(
      'loading',
      'eager',
    );
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mock.taxonomyGet).toHaveBeenCalledTimes(2);
    });
  });

  it('marks required onboarding fields and explains the marker on hover', async () => {
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="mahi@test.com" />);

    const entityMarker = screen.getByLabelText('Required');
    expect(entityMarker.tagName).toBe('SUP');
    expect(entityMarker).toHaveClass('cursor-default', 'text-destructive');

    await user.hover(entityMarker);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Required');

    await user.click(screen.getByRole('button', { name: /interior company \(firm\)/i }));

    expect(screen.getAllByLabelText('Required')).toHaveLength(2);
  });

  it('keeps the user on onboarding when the header is clicked from entity selection', async () => {
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="mahi@test.com" />);

    await user.click(screen.getByText('mahi@test.com'));

    expect(screen.getByRole('heading', { name: /set up your space/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/designer/onboarding');
    expect(mock.signOut).not.toHaveBeenCalled();
    expect(mock.router.push).not.toHaveBeenCalled();
  });

  it('treats the signed-in header as context instead of a navigation control', async () => {
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="mahi@test.com" />);

    expect(
      screen.queryByRole('button', { name: /signed in as mahi@test\.com/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('mahi@test.com')).toBeInTheDocument();

    await user.click(screen.getByText('mahi@test.com'));

    expect(mock.signOut).not.toHaveBeenCalled();
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

  it.each([/just me/i, /interior company \(firm\)/i])(
    'does not let unfinished %s mandatory details be skipped',
    async (entity) => {
      const user = userEvent.setup();
      render(<DesignerOnboarding signedInAs="mahi@test.com" />);
      await user.click(screen.getByRole('button', { name: entity }));

      expect(screen.queryByRole('button', { name: /finish later|skip to next step/i })).toBeNull();
    },
  );

  it('provisions an individual workspace when Finish later is used on the optional final step', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Finish later' }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'individual', userName: 'Mahi Studio' }),
      ),
    );
    expect(mock.router.push).not.toHaveBeenCalledWith('/designer/onboarding/deferred');
    expect(await screen.findByText(/you.re set up, mahi studio/i)).toBeInTheDocument();
  });

  it('requires current-step input before an individual can Continue', async () => {
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="mahi@test.com" />);

    await user.click(screen.getByRole('button', { name: /just me/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Mahi Studio');
    await user.type(screen.getByLabelText(/whatsapp number/i), '9123456789');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Finish later' })).toBeEnabled();

    await user.type(screen.getByLabelText(/website/i), 'mahi.example');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('keeps company presence optional but requires input before Continue', async () => {
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="mahi@test.com" />);

    await user.click(screen.getByRole('button', { name: /interior company \(firm\)/i }));
    await user.type(screen.getByLabelText(/company name/i), 'Mahi Interiors');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.queryByLabelText('Required')).not.toBeInTheDocument();
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip to Next step' })).toBeEnabled();

    fireEvent.submit(continueButton.closest('form')!);
    expect(screen.queryByLabelText(/services offered/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Skip to Next step' }));
    expect(screen.getByLabelText(/services offered/i)).toBeInTheDocument();
  });

  it('keeps valid optional company presence values when they are provided', async () => {
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="mahi@test.com" />);

    await user.click(screen.getByRole('button', { name: /interior company \(firm\)/i }));
    await user.type(screen.getByLabelText(/company name/i), 'Mahi Interiors');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.type(screen.getByLabelText(/whatsapp number/i), '9123456789');
    await user.type(screen.getByLabelText(/website/i), 'mahi.example');
    await user.type(screen.getByLabelText(/google business/i), 'google.com/maps/place/mahi');
    await user.type(screen.getByLabelText('Instagram'), '@mahi');
    await user.type(screen.getByLabelText('LinkedIn'), 'mahi-interiors');
    await user.type(screen.getByLabelText('YouTube'), '@mahi-interiors');

    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('validates optional company URLs when values are provided', async () => {
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="mahi@test.com" />);

    await user.click(screen.getByRole('button', { name: /interior company \(firm\)/i }));
    await user.type(screen.getByLabelText(/company name/i), 'Mahi Interiors');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.type(screen.getByLabelText(/website/i), 'invalid');
    await user.type(screen.getByLabelText(/google business/i), 'invalid');

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip to Next step' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Enter a valid website URL.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid Google Business URL.')).toBeInTheDocument();
    expect(screen.getByText('Social links')).toBeInTheDocument();
    expect(screen.queryByLabelText(/services offered/i)).not.toBeInTheDocument();
  });

  it('keeps company services optional but requires input before Continue', async () => {
    const submit = vi.fn().mockResolvedValue({
      created: true,
      data: {
        profile: {
          id: '11111111-1111-4111-8111-111111111111',
          orgId: 'org-1',
          displayName: 'Mahi Interiors',
          entityType: 'company',
          status: 'draft',
          createdAt: '2026-06-18T00:00:00.000Z',
        },
        organization: { id: 'org-1', name: 'Mahi Interiors', slug: 'mahi-interiors' },
      },
    });
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="mahi@test.com" onSubmitOnboarding={submit} />);

    await user.click(screen.getByRole('button', { name: /interior company \(firm\)/i }));
    await user.type(screen.getByLabelText(/company name/i), 'Mahi Interiors');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Skip to Next step' }));

    expect(screen.queryByLabelText('Required')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip to Next step' })).toBeEnabled();

    await user.click(screen.getByLabelText(/services offered/i));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /full home interiors/i }));
    await user.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'company',
          companyName: 'Mahi Interiors',
          scopeIds: ['22222222-2222-4222-8222-222222222222'],
          themeIds: [],
        }),
      ),
    );
    expect(await screen.findByText(/you.re set up, mahi interiors/i)).toBeInTheDocument();
  });

  it('disables Continue and Skip when a restored company draft is missing required details', async () => {
    render(
      <DesignerOnboarding
        signedInAs="mahi@test.com"
        initialDraft={{
          step: 'presence',
          updatedAt: '2026-02-01T00:00:00.000Z',
          fields: { entityType: 'company' },
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip to Next step' })).toBeDisabled();
    await waitFor(() => expect(mock.taxonomyGet).toHaveBeenCalledTimes(2));
  });

  it('renders generated initials avatars for individual and company details', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <DesignerOnboarding signedInAs="Sarthak Wade" signedInName="Sarthak Wade" />,
    );

    await user.click(screen.getByRole('button', { name: /just me/i }));

    const profileAvatar = screen.getByRole('img', { name: /generated profile initials/i });
    expect(profileAvatar).toHaveAttribute('src', expect.stringContaining('data:image/svg+xml'));

    unmount();
    render(<DesignerOnboarding signedInAs="Sarthak Wade" signedInName="Sarthak Wade" />);

    await user.click(screen.getByRole('button', { name: /interior company \(firm\)/i }));
    await user.type(screen.getByLabelText(/company name/i), 'Sarthak Interiors');

    const companyAvatar = screen.getByRole('img', { name: /generated company logo initials/i });
    expect(companyAvatar).toHaveAttribute('src', expect.stringContaining('data:image/svg+xml'));
    expect(decodeURIComponent(companyAvatar.getAttribute('src') ?? '')).toContain('SI');
  });

  it('keeps the user on the current onboarding step when the header is clicked', async () => {
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="mahi@test.com" />);

    await user.click(screen.getByRole('button', { name: /just me/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Mahi Studio');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText(/website/i)).toBeInTheDocument();

    await user.click(screen.getByText('mahi@test.com'));

    expect(screen.getByLabelText(/website/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
    expect(mock.signOut).not.toHaveBeenCalled();
    expect(mock.router.push).not.toHaveBeenCalled();
  });

  it('keeps the user on completion when the header is clicked', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Finish later' }));

    expect(await screen.findByText("You're set up, Mahi Studio! 🎉")).toBeInTheDocument();

    await user.click(screen.getByText('mahi@test.com'));

    expect(screen.getByText("You're set up, Mahi Studio! 🎉")).toBeInTheDocument();
    expect(screen.queryByLabelText(/website/i)).not.toBeInTheDocument();
    expect(mock.signOut).not.toHaveBeenCalled();
    expect(mock.router.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /skip to dashboard/i }));
    expect(mock.router.push).toHaveBeenCalledWith('/designer/dashboard');
  });

  it('falls back to a neutral greeting when the saved profile name is blank', async () => {
    const submit = vi.fn().mockResolvedValue({
      created: true,
      data: {
        profile: {
          id: '11111111-1111-4111-8111-111111111111',
          orgId: 'org-1',
          displayName: '   ',
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
    await user.click(screen.getByRole('button', { name: 'Finish later' }));

    expect(await screen.findByText("You're all set! 🎉")).toBeInTheDocument();
    expect(screen.queryByText(/there/i)).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Finish later' }));
    await user.click(await screen.findByRole('button', { name: /add your projects/i }));

    expect(mock.router.push).toHaveBeenCalledWith('/designer/projects/new');
  });

  it('completion messaging is truthful about publication and offers a portfolio CTA (E-278)', async () => {
    const submit = vi.fn().mockResolvedValue({
      created: true,
      data: {
        profile: {
          id: 'profile-1',
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
    await user.click(screen.getByRole('button', { name: 'Finish later' }));

    // Completion copy must not claim the profile is already public, and should
    // name the remaining hero requirements in user-facing language.
    // The publication gate is named accurately (the four hero fields), in
    // user-facing terms, and does not claim the page is already live.
    expect(await screen.findByText(/your workspace is ready/i)).toBeInTheDocument();
    const publicationCopy = screen.getByText(/to make your portfolio public/i);
    expect(publicationCopy).toHaveTextContent(/studio logo/i);
    expect(publicationCopy).toHaveTextContent(/studio name/i);
    expect(publicationCopy).toHaveTextContent(/tagline/i);
    expect(publicationCopy).toHaveTextContent(/short bio/i);
    // A published project is framed as a SEPARATE next step, never as part of
    // the publication gate (the backend gate is hero-only).
    expect(publicationCopy).not.toHaveTextContent(/project/i);
    expect(screen.getByText(/then add your first project/i)).toBeInTheDocument();

    // A clear CTA routes to the canonical Portfolio Settings route (the page
    // that owns the hero fields), not the separate profile editor.
    await user.click(screen.getByRole('button', { name: /complete your portfolio/i }));
    expect(mock.router.push).toHaveBeenCalledWith('/designer/portfolio');
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
    expect(screen.queryByRole('button', { name: 'Finish later' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/address/i), '12 Studio Lane, Chennai');

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText(/whatsapp number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/website/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/google business/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Skip to Next step' }));

    expect(screen.getByLabelText(/services offered/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/design themes/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/founded/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/team size/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/services offered/i));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /full home interiors/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /modular kitchen/i }));
    const servicesSelect = screen.getByLabelText(/services offered/i);
    expect(servicesSelect).toHaveTextContent(/Full Home Interiors, Modular Kitchen/i);
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
        scopeIds: ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'],
        themeIds: ['44444444-4444-4444-8444-444444444444'],
        firmType: 'Private Limited',
        foundedYear: 2021,
        staffCount: 10,
      });
    });
    expect(await screen.findByText("You're set up, Antika Interiors! 🎉")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add your projects/i })).toBeInTheDocument();
  });

  it('shows field-level validation for invalid URL inputs before submit', async () => {
    const submit = vi.fn();
    const user = userEvent.setup();

    render(<DesignerOnboarding signedInAs="mahi@test.com" onSubmitOnboarding={submit} />);

    await user.click(screen.getByRole('button', { name: /just me/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Mahi Studio');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText(/website/i), 'anything');
    await user.type(screen.getByLabelText(/google business/i), 'bad');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Enter a valid website URL.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid Google Business URL.')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
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
    await user.click(screen.getByRole('button', { name: 'Finish later' }));

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith(
        expect.not.objectContaining({ phone: expect.any(String) }),
      );
    });
  });

  it('surfaces API errors inline', async () => {
    const submit = vi
      .fn()
      .mockRejectedValue(new Error('Google SSO required for designer onboarding'));
    const user = userEvent.setup();

    render(<DesignerOnboarding signedInAs="mahi@test.com" onSubmitOnboarding={submit} />);

    await user.click(screen.getByRole('button', { name: /just me/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Mahi Studio');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText(/website/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/google business/i)).toBeInTheDocument();
    expect(screen.getByText(/social links/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Finish later' }));

    expect(await screen.findByText(/Google SSO required/i)).toBeInTheDocument();
  });
});

describe('DesignerOnboarding — E-298 draft persistence', () => {
  it('autosaves a return to the previously saved value while a changed value is in flight', async () => {
    vi.useFakeTimers();
    const pending = deferredSave();
    const onSaveDraft = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <DesignerOnboarding
        initialDraft={{ step: 'details', updatedAt: '2026-02-01T00:00:00.000Z', fields: {} }}
        onSaveDraft={onSaveDraft}
      />,
    );
    try {
      const name = screen.getByLabelText(/display name/i);
      fireEvent.change(name, { target: { value: 'Original' } });
      await act(() => vi.advanceTimersByTimeAsync(600));
      onSaveDraft.mockReturnValueOnce(pending.promise);
      fireEvent.change(name, { target: { value: 'Changed' } });
      await act(() => vi.advanceTimersByTimeAsync(600));
      fireEvent.change(name, { target: { value: 'Original' } });
      await act(() => vi.advanceTimersByTimeAsync(600));
      await act(async () => pending.resolve());
      expect(onSaveDraft).toHaveBeenCalledTimes(3);
      expect(onSaveDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({ fields: expect.objectContaining({ userName: 'Original' }) }),
      );
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  beforeEach(() => {
    // reset (not just clear) so a per-test push implementation never leaks.
    mock.router.push.mockReset();
    mock.signOut.mockClear();
    mock.signOut.mockResolvedValue(undefined);
    mock.taxonomyGet.mockReset();
    mock.taxonomyGet.mockImplementation(
      async ({ query }: { query: { kind?: keyof typeof taxonomyFixtures } }) => ({
        ok: true,
        json: async () => ({ terms: query.kind ? taxonomyFixtures[query.kind] : [] }),
      }),
    );
    window.history.pushState({}, '', '/designer/onboarding');
  });

  it('rehydrates the saved step and all field values from initialDraft', async () => {
    render(
      <DesignerOnboarding
        signedInAs="mahi@test.com"
        initialDraft={{
          step: 'presence',
          updatedAt: '2026-02-01T00:00:00.000Z',
          fields: {
            entityType: 'individual',
            userName: 'Mahi Studio',
            address: 'Bandra West, Mumbai',
            websiteUrl: 'https://mahi.example',
            instagramHandle: 'mahidesigns',
          },
        }}
        onSaveDraft={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    // Resumes directly on the presence step (not the entity picker or details).
    expect(await screen.findByLabelText(/website/i)).toHaveValue('https://mahi.example');
    expect(screen.queryByRole('button', { name: /just me/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
  });

  it('rehydrates company-only fields and the entity type', async () => {
    render(
      <DesignerOnboarding
        signedInAs="firm@test.com"
        initialDraft={{
          step: 'details',
          updatedAt: '2026-02-01T00:00:00.000Z',
          fields: { entityType: 'company', companyName: 'Antika Interiors', firmType: 'LLP' },
        }}
        onSaveDraft={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(await screen.findByLabelText(/company name/i)).toHaveValue('Antika Interiors');
  });

  it('does not carry a draft between accounts (isolation is by which draft is passed in)', async () => {
    // User B mounts with their own (empty) draft — never sees User A's values.
    render(
      <DesignerOnboarding
        signedInAs="userB@test.com"
        initialDraft={null}
        onSaveDraft={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    // Starts fresh at the entity picker.
    expect(await screen.findByRole('button', { name: /just me/i })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Owner A')).not.toBeInTheDocument();
  });

  it('starts fresh (no crash, entity step) when there is no draft — unchanged behavior', async () => {
    render(<DesignerOnboarding signedInAs="new@test.com" initialDraft={null} />);
    expect(await screen.findByRole('button', { name: /just me/i })).toBeInTheDocument();
  });

  it('autosaves after a debounce and coalesces rapid edits into a single trailing save', async () => {
    // Real timers (fake timers + userEvent + awaited promises deadlock here).
    // The debounce is 600ms; type several chars quickly, then wait past the window
    // and assert exactly one coalesced save carrying the final value.
    const onSaveDraft = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <DesignerOnboarding
        signedInAs="mahi@test.com"
        initialDraft={{ step: 'details', updatedAt: '2026-02-01T00:00:00.000Z', fields: {} }}
        onSaveDraft={onSaveDraft}
      />,
    );

    const name = await screen.findByLabelText(/display name/i);
    await user.type(name, 'Mahi'); // 4 rapid keystrokes

    // One coalesced save eventually fires with the final typed value.
    await waitFor(
      () =>
        expect(onSaveDraft).toHaveBeenLastCalledWith(
          expect.objectContaining({
            step: 'details',
            fields: expect.objectContaining({ userName: 'Mahi' }),
          }),
        ),
      { timeout: 4000 },
    );
    // Coalesced: far fewer saves than the 4 keystrokes (dirty-check + debounce).
    expect(onSaveDraft.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('persists a step transition (details -> presence) via a draft save', async () => {
    const onSaveDraft = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <DesignerOnboarding
        signedInAs="mahi@test.com"
        initialDraft={{
          step: 'details',
          updatedAt: '2026-02-01T00:00:00.000Z',
          fields: { entityType: 'individual', userName: 'Mahi Studio' },
        }}
        onSaveDraft={onSaveDraft}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    // Advancing to presence is persisted.
    await waitFor(() =>
      expect(onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({ step: 'presence' })),
    );
  });

  it('clears the draft after a successful onboarding submit', async () => {
    const onClearDraft = vi.fn().mockResolvedValue(undefined);
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
    render(
      <DesignerOnboarding
        signedInAs="mahi@test.com"
        initialDraft={{
          step: 'details',
          updatedAt: '2026-02-01T00:00:00.000Z',
          fields: { entityType: 'individual', userName: 'Mahi Studio' },
        }}
        onSubmitOnboarding={submit}
        onSaveDraft={vi.fn().mockResolvedValue(undefined)}
        onClearDraft={onClearDraft}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Continue' })); // details -> presence
    await user.click(await screen.findByRole('button', { name: 'Finish later' })); // presence -> submit

    expect(await screen.findByText(/you're set up/i)).toBeInTheDocument();
    await waitFor(() => expect(onClearDraft).toHaveBeenCalled());
  });

  it('filters stale scope/theme IDs against the freshly loaded taxonomy', async () => {
    const onSubmitOnboarding = vi.fn().mockResolvedValue({
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
        organization: { id: 'org-1', name: 'Antika Interiors', slug: 'antika' },
      },
    });
    const user = userEvent.setup();
    render(
      <DesignerOnboarding
        signedInAs="firm@test.com"
        initialDraft={{
          step: 'services',
          updatedAt: '2026-02-01T00:00:00.000Z',
          fields: {
            entityType: 'company',
            companyName: 'Antika Interiors',
            // One valid scope (in taxonomyFixtures) + one stale id that no longer exists.
            scopeIds: [
              '22222222-2222-4222-8222-222222222222',
              '99999999-9999-4999-8999-999999999999',
            ],
            themeIds: ['44444444-4444-4444-8444-444444444444'],
          },
        }}
        onSubmitOnboarding={onSubmitOnboarding}
        onSaveDraft={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    // Wait for taxonomy to load (which triggers the stale-id filter).
    await waitFor(() => expect(mock.taxonomyGet).toHaveBeenCalledTimes(2));
    // On the company `services` step the submit button is labeled "Continue".
    await user.click(await screen.findByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onSubmitOnboarding).toHaveBeenCalled());
    const payload = onSubmitOnboarding.mock.calls[0]![0];
    // The stale id is dropped; the valid one survives.
    expect(payload.scopeIds).toEqual(['22222222-2222-4222-8222-222222222222']);
    expect(payload.scopeIds).not.toContain('99999999-9999-4999-8999-999999999999');
    expect(payload.themeIds).toEqual(['44444444-4444-4444-8444-444444444444']);
  });
});
