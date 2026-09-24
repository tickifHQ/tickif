import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ComponentProps } from 'react';
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

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    unoptimized: _unoptimized,
    ...imageProps
  }: ComponentProps<'img'> & { fill?: boolean; unoptimized?: boolean }) =>
    createElement('img', imageProps),
}));

vi.mock('@/components/logo-crop-dialog', () => ({
  LogoCropDialog: ({
    imageSource,
    initialCrop,
    open,
  }: {
    imageSource: string | null;
    initialCrop: unknown;
    open: boolean;
  }) =>
    open ? (
      <div
        role="dialog"
        aria-label="Crop logo"
        data-image-source={imageSource}
        data-initial-crop={JSON.stringify(initialCrop)}
      />
    ) : null,
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
  logoUrl: null,
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
  const { organization: _organization, shareUrl: _shareUrl, logoUrl: _logoUrl, ...owner } = profile;
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
    // The Google Business Profile link is now editable in settings and prefilled
    // from the saved googleBusinessUrl.
    expect(screen.getByLabelText(/google business profile/i)).toHaveValue(
      'https://g.page/mahi-studio',
    );
    expect(screen.getByLabelText(/firm type/i)).toHaveValue('Private Limited');
    expect(screen.getByRole('button', { name: /cities: mumbai/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /services: full home interiors/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /design themes: modern/i })).toBeInTheDocument();
    expect(screen.getByText('70% complete')).toBeInTheDocument();
  });

  it('shows the saved portfolio logo instead of generated initials', () => {
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={{
          ...profile,
          logoUrl: 'https://storage.example.com/studio-logo.webp',
        }}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    expect(screen.getByRole('button', { name: 'Edit logo' })).toHaveClass('cursor-pointer');
    expect(screen.getByAltText('Mahi Studio logo')).toHaveAttribute(
      'src',
      'https://storage.example.com/studio-logo.webp',
    );
    expect(screen.queryByAltText('Generated profile initials')).not.toBeInTheDocument();
  });

  it('opens the shared logo crop workflow with the saved source and crop', async () => {
    const user = userEvent.setup();
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={{
          ...profile,
          logoUrl: 'https://storage.example.com/studio-logo.webp',
          logoSourceUrl: 'https://storage.example.com/studio-logo-source.png',
          logoCrop: { x: 10, y: 15, width: 60, height: 60 },
        }}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit logo' }));
    expect(await screen.findByRole('dialog', { name: 'Studio logo' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('dialog', { name: 'Crop logo' })).toHaveAttribute(
      'data-image-source',
      'https://storage.example.com/studio-logo-source.png',
    );
  });

  it('names each missing requirement with a direct action, including logo upload', () => {
    render(
      <DesignerProfileEditor
        initialCompletion={{ ...completion, score: 83, missing: ['logo'] }}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    expect(screen.getByText('1 item remaining')).toBeInTheDocument();
    expect(screen.getByText('Logo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upload your logo' })).toHaveAttribute(
      'href',
      '/designer/profile#profile-logo',
    );
  });

  it('links same-page requirements to their editors', () => {
    render(
      <DesignerProfileEditor
        initialCompletion={{ ...completion, score: 67, missing: ['bio', 'scope'] }}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    expect(screen.getByText('2 items remaining')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Write your bio' })).toHaveAttribute(
      'href',
      '/designer/profile#profile-bio',
    );
    expect(screen.getByRole('link', { name: 'Choose your services' })).toHaveAttribute(
      'href',
      '/designer/profile#profile-services',
    );
  });

  it('routes missing contact to account verification since the studio phone cannot satisfy it', () => {
    render(
      <DesignerProfileEditor
        initialCompletion={{ ...completion, score: 83, missing: ['contact'] }}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    expect(screen.getByText('Contact details')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Verify your phone number' })).toHaveAttribute(
      'href',
      '/designer/verification',
    );
  });

  it('glides to the bio editor and focuses it when its action is selected', () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      render(
        <DesignerProfileEditor
          initialCompletion={{ ...completion, score: 83, missing: ['bio'] }}
          initialProfile={profile}
          taxonomy={terms}
          taxonomyError={null}
        />,
      );

      fireEvent.click(screen.getByRole('link', { name: 'Write your bio' }));

      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
      expect(screen.getByLabelText(/bio/i)).toHaveFocus();
    } finally {
      // @ts-expect-error jsdom has no scrollIntoView; restore the missing builtin.
      delete window.HTMLElement.prototype.scrollIntoView;
    }
  });

  it('still names unrecognized requirements instead of dropping them', () => {
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    expect(screen.getByText('1 item remaining')).toBeInTheDocument();
    expect(screen.getByText('Publish a project')).toBeInTheDocument();
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
    expect(mock.refresh).toHaveBeenCalledOnce();
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
    await user.clear(website);
    await user.type(website, 'mahi2.example.com');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mock.updateDesignerProfile).toHaveBeenCalledWith({
        websiteUrl: 'https://mahi2.example.com',
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

  it('normalizes and saves an edited Google Business Profile link', async () => {
    const user = userEvent.setup();
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    const googleField = screen.getByLabelText(/google business profile/i);
    await user.clear(googleField);
    await user.type(googleField, 'g.page/mahi-updated');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mock.updateDesignerProfile).toHaveBeenCalledWith({
        googleBusinessUrl: 'https://g.page/mahi-updated',
      });
    });
  });

  it('directs owners to portfolio settings to connect Google reviews separately', () => {
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    expect(
      screen.getByText(/saving this link does not change your google review connection/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /manage google reviews in portfolio settings/i }),
    ).toHaveAttribute('href', '/designer/portfolio');
  });

  it('clears the Google Business Profile link by sending null when emptied', async () => {
    const user = userEvent.setup();
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    await user.clear(screen.getByLabelText(/google business profile/i));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mock.updateDesignerProfile).toHaveBeenCalledWith({ googleBusinessUrl: null });
    });
  });

  it('rejects an invalid Google Business Profile link without sending an update', async () => {
    const user = userEvent.setup();
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    const googleField = screen.getByLabelText(/google business profile/i);
    await user.clear(googleField);
    await user.type(googleField, 'not-a-url');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/enter a valid url/i)).toBeInTheDocument();
    expect(googleField).toHaveAttribute('aria-invalid', 'true');
    expect(mock.updateDesignerProfile).not.toHaveBeenCalled();
  });

  it('leaves the Google Business Profile link untouched when a profile has none', () => {
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={{ ...profile, googleBusinessUrl: null }}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    expect(screen.getByLabelText(/google business profile/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('wires the remaining contact, social, company, and footprint fields without touching the stored business URL', async () => {
    const user = userEvent.setup();
    render(
      <DesignerProfileEditor
        initialCompletion={completion}
        initialProfile={profile}
        taxonomy={terms}
        taxonomyError={null}
      />,
    );

    const changes = [
      ['Display name', 'Updated Studio'],
      ['Bio', 'Updated studio bio.'],
      ['Address', 'Pune, Maharashtra'],
      ['WhatsApp / phone', '9123456789'],
      ['Website', 'updated.example.com'],
      ['Instagram', '@updatedstudio'],
      ['LinkedIn', '/company/updatedstudio'],
      ['YouTube', '@updatedstudio'],
      ['Firm type', 'LLP'],
      ['Founded year', '2022'],
      ['Staff count', '20'],
    ] as const;
    for (const [label, value] of changes) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    await user.click(screen.getByRole('button', { name: /services: full home interiors/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Full Home Interiors' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /design themes: modern/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Modern' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mock.updateDesignerProfile).toHaveBeenCalledWith({
        displayName: 'Updated Studio',
        bio: 'Updated studio bio.',
        address: 'Pune, Maharashtra',
        phone: '+919123456789',
        websiteUrl: 'https://updated.example.com',
        instagramHandle: '@updatedstudio',
        linkedinHandle: '/company/updatedstudio',
        youtubeHandle: '@updatedstudio',
        firmType: 'LLP',
        foundedYear: 2022,
        staffCount: 20,
        scopeIds: [],
        themeIds: [],
      });
    });
    expect(mock.updateDesignerProfile.mock.calls[0]?.[0]).not.toHaveProperty('googleBusinessUrl');
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

    expect(screen.getByLabelText(/bio/i)).toHaveValue('Warm, practical homes. In-flight edit.');
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
