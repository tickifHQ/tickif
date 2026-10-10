import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VisitorFeedOnboarding } from '../../src/components/visitor-feed-onboarding';

const mock = vi.hoisted(() => ({
  taxonomy: vi.fn(),
  search: vi.fn(),
  save: vi.fn(),
  session: vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      taxonomy: { terms: { $get: mock.taxonomy } },
      search: { $get: mock.search },
      visitors: { me: { 'feed-preferences': { $put: mock.save } } },
    },
  },
}));
vi.mock('@/lib/auth-client', () => ({ authClient: { getSession: mock.session } }));
const city = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Chennai',
  slug: 'chennai',
  parentId: null,
};
const locality = {
  id: '22222222-2222-4222-8222-222222222222',
  label: 'Adyar',
  slug: 'adyar',
  parentId: city.id,
};
const preferences = {
  homeType: '3-bhk',
  city,
  locality,
  onboardingCompletedAt: '2026-10-10T10:00:00.000Z',
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.taxonomy.mockImplementation(({ query }) =>
    Promise.resolve(Response.json({ terms: query.kind === 'city' ? [city] : [locality] })),
  );
  mock.search.mockResolvedValue(
    Response.json({
      hits: [],
      estimatedTotalHits: 0,
      facetDistribution: {},
      processingTimeMs: 0,
      page: 1,
      limit: 3,
      fallback: 'none',
      relaxedFilters: [],
    }),
  );
  mock.save.mockResolvedValue(Response.json(preferences));
  mock.session.mockResolvedValue({ data: null });
});
async function choose() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('radio', { name: '3 BHK' }));
  const cityInput = screen.getByRole('combobox', { name: 'Where is it?' });
  await waitFor(() => expect(cityInput).not.toBeDisabled());
  await user.click(cityInput);
  await user.click(await screen.findByRole('option', { name: 'Chennai' }));
  return user;
}
describe('VisitorFeedOnboarding', () => {
  it('offers sign-in recovery when the preference write session expires', async () => {
    mock.save.mockResolvedValue(
      Response.json({ error: { message: 'Unauthorized' } }, { status: 401 }),
    );
    render(<VisitorFeedOnboarding onComplete={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/login',
    );
  });
  it('does not misreport a successful save if session refresh temporarily fails', async () => {
    mock.session.mockRejectedValue(new Error('Offline'));
    const complete = vi.fn();
    render(<VisitorFeedOnboarding onComplete={complete} />);
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('focuses its heading and keeps submission disabled before valid choices', async () => {
    render(<VisitorFeedOnboarding onComplete={vi.fn()} />);
    expect(screen.getByRole('heading', { name: "You're in, welcome!" })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Show my feed' })).toBeDisabled();
    await screen.findByRole('combobox', { name: 'Where is it?' });
  });
  it('saves real taxonomy IDs and uses the same location and home filters in preview and feed', async () => {
    const complete = vi.fn();
    render(<VisitorFeedOnboarding onComplete={complete} />);
    const user = await choose();
    await user.click(await screen.findByRole('button', { name: 'Adyar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Show my feed' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Show my feed' }));
    await waitFor(() =>
      expect(complete).toHaveBeenCalledWith('/home?city=chennai&locality=adyar&bhk=3-bhk'),
    );
    expect(mock.save).toHaveBeenCalledWith({
      json: { homeType: '3-bhk', cityId: city.id, localityId: locality.id },
    });
    expect(mock.search).toHaveBeenLastCalledWith(
      { query: { q: '', limit: 3, citySlug: 'chennai', localitySlug: 'adyar', bhkSlug: '3-bhk' } },
      expect.anything(),
    );
  });
  it('lets visitors skip when taxonomy is unavailable', async () => {
    mock.taxonomy.mockRejectedValue(new Error('Offline'));
    mock.save.mockResolvedValue(
      Response.json({ ...preferences, homeType: null, city: null, locality: null }),
    );
    const complete = vi.fn();
    render(<VisitorFeedOnboarding onComplete={complete} />);
    await screen.findByText(/Could not load locations/);
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(complete).toHaveBeenCalledWith('/home'));
    expect(mock.save).toHaveBeenCalledWith({
      json: { homeType: null, cityId: null, localityId: null },
    });
  });
  it('can retry taxonomy and save failures without losing the selected home type', async () => {
    mock.taxonomy.mockRejectedValueOnce(new Error('Offline'));
    mock.save.mockResolvedValueOnce(
      Response.json({ error: { message: 'Please try again' } }, { status: 503 }),
    );
    const complete = vi.fn();
    render(<VisitorFeedOnboarding onComplete={complete} />);
    await screen.findByText(/Could not load locations/);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const user = await choose();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Show my feed' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Show my feed' }));
    await screen.findByRole('alert');
    expect(complete).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: '3 BHK' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: 'Show my feed' }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
  });
  it('search failure does not block preferences and empty locations retain Skip', async () => {
    mock.search.mockRejectedValue(new Error('Offline'));
    render(<VisitorFeedOnboarding onComplete={vi.fn()} />);
    await choose();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Show my feed' })).toBeEnabled());
    expect(
      screen.getByText('Your feed will help you discover homes and fresh ideas.'),
    ).toBeInTheDocument();
  });
});
