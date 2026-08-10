import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const extraCities: TaxonomyTerm[] = Array.from({ length: 5 }, (_, index) => ({
  id: `${index + 5}5555555-5555-4555-8555-555555555555`,
  label: `City ${index + 2}`,
  slug: `city-${index + 2}`,
  parentId: null,
}));

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
    { ...terms.cities[0]!, kind: 'city' as const },
    { ...terms.scopes[0]!, kind: 'scope' as const },
    { ...terms.themes[0]!, kind: 'theme' as const },
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
    await waitFor(() => {
      expect(screen.queryByRole('menuitemcheckbox', { name: 'Pune' })).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mock.updateDesignerProfile).toHaveBeenCalledWith({
        displayName: 'Mahi Design Co.',
        cityIds: [terms.cities[0]!.id, terms.cities[1]!.id],
      });
    });
    expect(await screen.findByText(/profile saved/i)).toBeInTheDocument();
    expect(screen.getByText('80% complete')).toBeInTheDocument();
    expect(mock.fetchProfileCompletion).toHaveBeenCalledOnce();
    expect(mock.refresh).not.toHaveBeenCalled();
  });

  it('normalizes bare website URLs before validating and saving them', async () => {
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
    const googleBusiness = screen.getByLabelText(/google business url/i);
    await user.clear(website);
    await user.type(website, 'mahi2.example.com');
    await user.clear(googleBusiness);
    await user.type(googleBusiness, 'g.page/mahi-two');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mock.updateDesignerProfile).toHaveBeenCalledWith({
        websiteUrl: 'https://mahi2.example.com',
        googleBusinessUrl: 'https://g.page/mahi-two',
      });
    });
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

  it('preserves international phone numbers and omits unchanged fields from PATCH', async () => {
    const user = userEvent.setup();
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={{ ...profile, phone: '+4915112345678' }}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    expect(screen.getByLabelText(/whatsapp \/ phone/i)).toHaveValue('15112345678');
    expect(screen.getByRole('button', { name: /country code, germany \+49/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/bio/i), ' More detail.');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mock.updateDesignerProfile).toHaveBeenCalledOnce());
    expect(mock.updateDesignerProfile.mock.calls[0]?.[0]).toEqual({
      bio: 'Warm, practical homes. More detail.',
    });
  });

  it('keeps countries with shared dial codes distinct', () => {
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={{ ...profile, phone: '+13124567890' }}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    expect(
      screen.getByRole('button', { name: /country code, united states \+1/i }),
    ).toBeInTheDocument();
  });

  it('rejects invalid phone numbers with a visible field error', async () => {
    const user = userEvent.setup();
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    const phone = screen.getByLabelText(/whatsapp \/ phone/i);
    await user.clear(phone);
    await user.type(phone, '1234567');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Enter a valid phone number.')).toBeInTheDocument();
    expect(phone).toHaveAttribute('aria-invalid', 'true');
    expect(mock.updateDesignerProfile).not.toHaveBeenCalled();
  });

  it('shows footprint errors instead of silently ignoring an over-limit profile', async () => {
    const user = userEvent.setup();
    const cities = [terms.cities[0]!, ...extraCities];
    const footprint = [
      ...cities.map((term) => ({ ...term, kind: 'city' as const })),
      ...profile.footprint.filter((term) => term.kind !== 'city'),
    ];

    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={{ ...profile, footprint }}
        taxonomy={{ ...terms, cities }}
        taxonomyError={null}
      />,
    );

    expect(screen.getByText('Select up to 5 cities.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cities:/i })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await user.type(screen.getByLabelText(/bio/i), ' More detail.');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mock.updateDesignerProfile).toHaveBeenCalledWith({
        bio: 'Warm, practical homes. More detail.',
      });
    });
  });

  it('retains hidden company data when switching to an individual listing', async () => {
    const user = userEvent.setup();
    mock.updateDesignerProfile.mockResolvedValue(ownerProfile({ entityType: 'individual' }));
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/listing type/i), 'individual');
    expect(screen.queryByText('Company details')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mock.updateDesignerProfile).toHaveBeenCalledWith({ entityType: 'individual' });
    });
  });

  it('does not treat hidden company-only edits as a saveable individual-profile change', async () => {
    const user = userEvent.setup();
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={{ ...profile, entityType: 'individual' }}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/listing type/i), 'company');
    await user.clear(screen.getByLabelText(/firm type/i));
    await user.type(screen.getByLabelText(/firm type/i), 'LLP');
    await user.selectOptions(screen.getByLabelText(/listing type/i), 'individual');

    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(screen.getByText('All changes are saved.')).toBeInTheDocument();
    expect(mock.updateDesignerProfile).not.toHaveBeenCalled();
  });

  it('keeps unrelated validation errors visible while another field is corrected', async () => {
    const user = userEvent.setup();
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'M' } });
    fireEvent.change(screen.getByLabelText(/website/i), { target: { value: 'not-a-url' } });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Use at least 2 characters.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid URL.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Mahi Studio Updated' },
    });
    expect(screen.queryByText('Use at least 2 characters.')).not.toBeInTheDocument();
    expect(screen.getByText('Enter a valid URL.')).toBeInTheDocument();
  });

  it('wires company field errors to their controls', async () => {
    const user = userEvent.setup();
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    fireEvent.change(screen.getByLabelText(/founded year/i), { target: { value: '1899' } });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    const error = await screen.findByText('Enter a year from 1900 onward.');
    expect(screen.getByLabelText(/founded year/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/founded year/i)).toHaveAttribute('aria-describedby', error.id);
  });

  it('preserves edits made during an in-flight save and keeps the phone editable', async () => {
    const user = userEvent.setup();
    let resolveUpdate: ((value: ProfileOwnerResponse) => void) | undefined;
    mock.updateDesignerProfile.mockReturnValue(
      new Promise<ProfileOwnerResponse>((resolve) => {
        resolveUpdate = resolve;
      }),
    );
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
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByLabelText(/whatsapp \/ phone/i)).not.toBeDisabled();

    await user.type(screen.getByLabelText(/bio/i), ' In-flight edit.');
    await act(async () => {
      resolveUpdate?.(ownerProfile({ displayName: 'Mahi Design Co.' }));
    });

    expect(screen.getByLabelText(/bio/i)).toHaveValue(
      'Warm, practical homes. In-flight edit.',
    );
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
  });

  it('keeps the last completion score when its post-save refresh fails', async () => {
    const user = userEvent.setup();
    mock.fetchProfileCompletion.mockRejectedValue(new Error('completion unavailable'));
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    await user.type(screen.getByLabelText(/bio/i), ' More detail.');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/profile saved/i)).toBeInTheDocument();
    expect(screen.getByText('70% complete')).toBeInTheDocument();
  });
});
