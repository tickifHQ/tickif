import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { visitorFeedFilters, type VisitorFeedPreferences } from '@repo/contracts';
import { VisitorOnboardingForm } from '../../src/components/visitor-onboarding-form';

const mock = vi.hoisted(() => ({
  save: vi.fn(),
  taxonomy: vi.fn(),
  search: vi.fn(),
  session: vi.fn(),
  assign: vi.fn(),
}));
vi.mock('@/lib/auth-client', () => ({ authClient: { getSession: mock.session } }));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      visitors: { me: { 'feed-preferences': { $put: mock.save } } },
      taxonomy: { terms: { $get: mock.taxonomy } },
      search: { $get: mock.search },
    },
  },
}));

const chennai = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'chennai',
  label: 'Chennai',
  parentId: null,
};
const adyar = {
  id: '00000000-0000-4000-8000-000000000002',
  slug: 'adyar',
  label: 'Adyar',
  parentId: chennai.id,
};
const empty = { homeType: null, citySlug: null, localitySlug: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('location', { assign: mock.assign });
  mock.taxonomy.mockImplementation(async ({ query }: { query: { kind: string } }) =>
    Response.json({ terms: query.kind === 'city' ? [chennai] : [adyar] }),
  );
  mock.search.mockResolvedValue(new Response(null, { status: 503 }));
  mock.session.mockResolvedValue({ data: { user: { status: 'active' } } });
  mock.save.mockImplementation(async ({ json }: { json: VisitorFeedPreferences }) =>
    Response.json({ preferences: json, filters: visitorFeedFilters(json) }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('visitor welcome form', () => {
  it('saves 4 BHK+ and a locality before navigating to the matching feed', async () => {
    const user = userEvent.setup();
    render(<VisitorOnboardingForm />);
    await user.click(screen.getByRole('button', { name: '4 BHK+' }));
    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Adyar, Chennai' }));
    await user.click(screen.getByRole('button', { name: 'Show my feed' }));
    await waitFor(() =>
      expect(mock.assign).toHaveBeenCalledWith(
        '/home?feed=custom&bhk=4-bhk%2C4-plus-bhk&city=chennai&locality=adyar',
      ),
    );
    expect(mock.save).toHaveBeenCalledWith({
      json: { homeType: '4-plus-bhk', citySlug: 'chennai', localitySlug: 'adyar' },
    });
  });

  it('persists Skip as an explicit empty choice and preserves the original action', async () => {
    const user = userEvent.setup();
    render(<VisitorOnboardingForm callbackPath="/projects/project-1?save=1" />);
    await user.click(screen.getByRole('button', { name: 'Villa' }));
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(mock.assign).toHaveBeenCalledWith('/projects/project-1?save=1'));
    expect(mock.save).toHaveBeenCalledWith({ json: empty });
  });

  it('keeps choices after a failed save and retries without an early redirect', async () => {
    mock.save.mockResolvedValueOnce(
      Response.json({ error: { message: 'Try again' } }, { status: 503 }),
    );
    const user = userEvent.setup();
    render(<VisitorOnboardingForm />);
    await user.click(screen.getByRole('button', { name: 'Villa' }));
    await user.click(screen.getByRole('button', { name: 'Show my feed' }));
    await screen.findByRole('alert');
    expect(mock.assign).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Villa' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Show my feed' }));
    await waitFor(() =>
      expect(mock.assign).toHaveBeenCalledWith(
        '/home?feed=custom&propertyType=residential&propertySubtype=villa',
      ),
    );
  });

  it('can skip if location loading fails, without inventing matching project counts', async () => {
    mock.taxonomy.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<VisitorOnboardingForm />);
    await screen.findByRole('button', { name: 'Retry' });
    expect(screen.queryByText(/418|12,400|verified|nearby/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Skip setup' }));
    await waitFor(() => expect(mock.save).toHaveBeenCalledWith({ json: empty }));
  });

  it('restores saved choices for editing and clears locality when selecting a city', async () => {
    const user = userEvent.setup();
    render(
      <VisitorOnboardingForm
        initialPreferences={{ homeType: '3-bhk', citySlug: 'chennai', localitySlug: 'adyar' }}
      />,
    );
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Adyar, Chennai'));
    expect(screen.getByRole('button', { name: '3 BHK' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Chennai' }));
    await user.click(screen.getByRole('button', { name: 'Show my feed' }));
    await waitFor(() =>
      expect(mock.save).toHaveBeenCalledWith({
        json: { homeType: '3-bhk', citySlug: 'chennai', localitySlug: null },
      }),
    );
  });
});
