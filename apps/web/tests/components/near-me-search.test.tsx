import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NearMeSearch } from '../../src/components/near-me-search';
const mock = vi.hoisted(() => ({
  push: vi.fn(),
  post: vi.fn(),
  getPosition: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mock.push }),
  useSearchParams: () => mock.params,
}));
vi.mock('@/lib/api', () => ({
  api: { api: { taxonomy: { locations: { nearby: { $post: mock.post } } } } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.params = new URLSearchParams('city=mumbai&locality=bandra&page=3&room=kitchen');
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: mock.getPosition } });
  mock.post.mockResolvedValue(
    Response.json({
      city: {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'vapi',
        label: 'Vapi',
        parentId: null,
      },
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('Near me', () => {
  it('requests location only after the visitor reads the disclosure and chooses to continue', () => {
    render(<NearMeSearch />);
    expect(mock.getPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Near me' }));
    expect(
      screen.getByText(/Tickif sends an approximate location to Google Maps/),
    ).toBeInTheDocument();
    expect(mock.getPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(mock.getPosition).toHaveBeenCalledTimes(1);
  });
  it.each(['/', '/home'])(
    'applies a city filter at %s while preserving other preferences',
    async (basePath) => {
      mock.getPosition.mockImplementation((success: PositionCallback) =>
        success({ coords: { latitude: 20.37123, longitude: 72.90123 } } as GeolocationPosition),
      );
      render(<NearMeSearch basePath={basePath} query="warm kitchen" />);
      fireEvent.click(screen.getByRole('button', { name: 'Near me' }));
      fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
      await waitFor(() => expect(mock.push).toHaveBeenCalled());
      const url = new URL(mock.push.mock.calls[0]![0], 'http://localhost');
      expect(url.pathname).toBe(basePath);
      expect(url.searchParams.get('city')).toBe('vapi');
      expect(url.searchParams.get('q')).toBe('warm kitchen');
      expect(url.searchParams.get('room')).toBe('kitchen');
      expect(url.searchParams.has('locality')).toBe(false);
      expect(url.searchParams.has('page')).toBe(false);
      expect(url.searchParams.has('latitude')).toBe(false);
      if (basePath === '/home') expect(url.searchParams.get('feed')).toBe('custom');
      expect(mock.post).toHaveBeenCalledWith(
        { json: { latitude: 20.37, longitude: 72.9 } },
        expect.anything(),
      );
    },
  );
  it('preserves the current search when permission is denied', async () => {
    mock.getPosition.mockImplementation(
      (_success: PositionCallback, failure: PositionErrorCallback) =>
        failure({ code: 1 } as GeolocationPositionError),
    );
    render(<NearMeSearch />);
    fireEvent.click(screen.getByRole('button', { name: 'Near me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('permission was denied');
    expect(mock.post).not.toHaveBeenCalled();
    expect(mock.push).not.toHaveBeenCalled();
  });
  it.each([
    [2, 'Turn on location services in your device settings'],
    [3, 'Finding your location timed out'],
  ])('explains device location error %s without calling the city lookup', async (code, message) => {
    mock.getPosition.mockImplementation(
      (_success: PositionCallback, failure: PositionErrorCallback) =>
        failure({ code } as GeolocationPositionError),
    );
    render(<NearMeSearch />);
    fireEvent.click(screen.getByRole('button', { name: 'Near me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(String(message));
    expect(mock.post).not.toHaveBeenCalled();
    expect(mock.push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Use my location' })).toBeEnabled();
  });

  it('ignores a device response after cancellation', async () => {
    let success!: PositionCallback;
    mock.getPosition.mockImplementation((callback: PositionCallback) => {
      success = callback;
    });
    render(<NearMeSearch />);
    fireEvent.click(screen.getByRole('button', { name: 'Near me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose a city instead' }));
    await act(async () => {
      success({ coords: { latitude: 20.37, longitude: 72.9 } } as GeolocationPosition);
    });
    expect(mock.post).not.toHaveBeenCalled();
    expect(mock.push).not.toHaveBeenCalled();
  });
  it('keeps a provider error visible and allows retry', async () => {
    mock.getPosition.mockImplementation((success: PositionCallback) =>
      success({ coords: { latitude: 20.37, longitude: 72.9 } } as GeolocationPosition),
    );
    mock.post.mockResolvedValue(
      Response.json(
        {
          error: {
            code: 'nearby_unavailable',
            message: 'Near me is unavailable. Choose a city instead.',
          },
        },
        { status: 503 },
      ),
    );
    render(<NearMeSearch />);
    fireEvent.click(screen.getByRole('button', { name: 'Near me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Near me is unavailable');
    expect(screen.getByRole('button', { name: 'Use my location' })).toBeEnabled();
    expect(mock.push).not.toHaveBeenCalled();
  });
});
