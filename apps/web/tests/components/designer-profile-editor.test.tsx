import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CurrentProfileResponse,
  ProfileCompletionResponse,
  ProfileOwnerResponse,
  TaxonomyTerm,
} from '@repo/contracts';
import { DesignerProfileEditor } from '../../src/components/designer-profile-editor';

const mock = vi.hoisted(() => ({
  fetchProfileCompletion: vi.fn(),
  refresh: vi.fn(),
  updateDesignerProfile: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mock.refresh }),
}));

vi.mock('@/lib/profile-editor-api', () => ({
  fetchProfileCompletion: mock.fetchProfileCompletion,
  updateDesignerProfile: mock.updateDesignerProfile,
}));

const terms = {
  cities: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      label: 'Mumbai',
      slug: 'mumbai',
      parentId: null,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      label: 'Pune',
      slug: 'pune',
      parentId: null,
    },
  ],
  scopes: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      label: 'Full Home Interiors',
      slug: 'full-home-interiors',
      parentId: null,
    },
  ],
  themes: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      label: 'Modern',
      slug: 'modern',
      parentId: null,
    },
  ],
} satisfies Record<string, TaxonomyTerm[]>;

const profile: CurrentProfileResponse = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  orgId: 'org-1',
  displayName: 'Mahi Studio',
  entityType: 'company',
  bio: 'Warm, practical homes.',
  logoImageId: null,
  status: 'active',
  yearsExperience: 5,
  projectCount: 8,
  shareCount: 3,
  avgRating: '4.8',
  reviewCount: 6,
  websiteUrl: 'https://mahi.example.com',
  googleBusinessUrl: 'https://g.page/mahi-studio',
  phone: '+919876543210',
  address: 'Bandra West, Mumbai',
  instagramHandle: '@mahistudio',
  linkedinHandle: '/company/mahi-studio',
  youtubeHandle: '@mahistudio',
  firmType: 'Private Limited',
  foundedYear: 2020,
  staffCount: 12,
  testimonialBannerEnabled: true,
  footprint: [
    { ...terms.cities[0]!, kind: 'city' },
    { ...terms.scopes[0]!, kind: 'scope' },
    { ...terms.themes[0]!, kind: 'theme' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  organization: { id: 'org-1', name: 'Mahi Studio', slug: 'mahi-studio' },
  shareUrl: 'https://tickif.example.com/d/mahi-studio',
};

const completion: ProfileCompletionResponse = {
  score: 70,
  missing: ['Publish a project'],
  steps: [{ key: 'profile', label: 'Complete your profile', done: true }],
};

function ownerProfile(overrides: Partial<ProfileOwnerResponse> = {}): ProfileOwnerResponse {
  const { organization: _organization, shareUrl: _shareUrl, ...owner } = profile;
  return { ...owner, ...overrides };
}

describe('DesignerProfileEditor', () => {
  beforeEach(() => {
    mock.fetchProfileCompletion.mockReset();
    mock.refresh.mockReset();
    mock.updateDesignerProfile.mockReset();
    mock.fetchProfileCompletion.mockResolvedValue({ ...completion, score: 80 });
    mock.updateDesignerProfile.mockResolvedValue(ownerProfile());
  });

  it('prefills every section from the live profile and taxonomy data', () => {
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    expect(screen.getByLabelText(/display name/i)).toHaveValue('Mahi Studio');
    expect(screen.getByLabelText(/listing type/i)).toHaveValue('company');
    expect(screen.getByLabelText(/bio/i)).toHaveValue('Warm, practical homes.');
    expect(screen.getByLabelText(/address/i)).toHaveValue('Bandra West, Mumbai');
    expect(screen.getByLabelText(/whatsapp \/ phone/i)).toHaveValue('9876543210');
    expect(screen.getByLabelText(/website/i)).toHaveValue('https://mahi.example.com');
    expect(screen.getByLabelText(/firm type/i)).toHaveValue('Private Limited');
    expect(screen.getByRole('button', { name: /cities: mumbai/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /services: full home interiors/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /design themes: modern/i })).toBeInTheDocument();
    expect(screen.getByText('70% complete')).toBeInTheDocument();
  });

  it('saves validated profile and footprint changes, then refreshes completion', async () => {
    const user = userEvent.setup();
    mock.updateDesignerProfile.mockResolvedValue(ownerProfile({ displayName: 'Mahi Design Co.' }));

    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    const displayName = screen.getByLabelText(/display name/i);
    await user.clear(displayName);
    await user.type(displayName, 'Mahi Design Co.');
    await user.click(screen.getByRole('button', { name: /cities: mumbai/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Pune' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mock.updateDesignerProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Mahi Design Co.',
          cityIds: [terms.cities[0]!.id, terms.cities[1]!.id],
          scopeIds: [terms.scopes[0]!.id],
          themeIds: [terms.themes[0]!.id],
        }),
      );
    });
    expect(await screen.findByText(/profile saved/i)).toBeInTheDocument();
    expect(screen.getByText('80% complete')).toBeInTheDocument();
    expect(mock.fetchProfileCompletion).toHaveBeenCalledOnce();
    expect(mock.refresh).toHaveBeenCalledOnce();
  });

  it('shows contract validation errors without sending an invalid update', async () => {
    const user = userEvent.setup();
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    const website = screen.getByLabelText(/website/i);
    await user.clear(website);
    await user.type(website, 'not-a-url');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/enter a valid url/i)).toBeInTheDocument();
    expect(mock.updateDesignerProfile).not.toHaveBeenCalled();
  });

  it('surfaces API and taxonomy failures without discarding the form', async () => {
    const user = userEvent.setup();
    mock.updateDesignerProfile.mockRejectedValue(new Error('You no longer have edit access.'));

    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError="Could not load profile footprint options."
      />,
    );

    expect(screen.getByText(/could not load profile footprint options/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/bio/i), ' More detail.');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('You no longer have edit access.')).toBeInTheDocument();
    expect(screen.getByLabelText(/bio/i)).toHaveValue('Warm, practical homes. More detail.');
  });
});
