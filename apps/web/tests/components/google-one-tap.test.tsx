import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { continuationPath, GoogleOneTap } from '../../src/components/google-one-tap';

const envState = vi.hoisted(() => ({
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com' as string | undefined,
}));
const oneTap = vi.hoisted(() => vi.fn());

vi.mock('../../src/env', () => ({ env: envState }));
vi.mock('../../src/lib/auth-client', () => ({ authClient: { oneTap } }));

const SNOOZED_UNTIL_KEY = 'tickif:google-one-tap-snoozed-until:v1';

type PromptOptions = { onPromptNotification: (notification: unknown) => void };

function promptOptions(): PromptOptions {
  return oneTap.mock.calls[0]![0] as PromptOptions;
}

describe('GoogleOneTap', () => {
  beforeEach(() => {
    oneTap.mockReset().mockResolvedValue(undefined);
    envState.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'client-id.apps.googleusercontent.com';
    window.localStorage.clear();
    window.history.replaceState(null, '', '/designers?city=pune');
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('prompts and continues through login back to the current page', () => {
    render(<GoogleOneTap />);

    expect(oneTap).toHaveBeenCalledOnce();
    expect(oneTap).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: '/login?callbackURL=%2Fdesigners%3Fcity%3Dpune' }),
    );
  });

  it('does not prompt again after the visitor closed it', () => {
    render(<GoogleOneTap />);
    promptOptions().onPromptNotification({ isSkippedMoment: () => true });
    oneTap.mockClear();

    render(<GoogleOneTap />);

    expect(oneTap).not.toHaveBeenCalled();
  });

  it('prompts again once the 30-day snooze has passed', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      render(<GoogleOneTap />);
      promptOptions().onPromptNotification({ isSkippedMoment: () => true });
      oneTap.mockClear();

      vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60_000);
      render(<GoogleOneTap />);

      expect(oneTap).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not count a returned credential as a dismissal', () => {
    render(<GoogleOneTap />);
    promptOptions().onPromptNotification({
      isSkippedMoment: () => false,
      isDismissedMoment: () => true,
      getDismissedReason: () => 'credential_returned',
    });

    expect(window.localStorage.getItem(SNOOZED_UNTIL_KEY)).toBeNull();
  });

  it('stays hidden when no Google client id is configured', () => {
    envState.NEXT_PUBLIC_GOOGLE_CLIENT_ID = undefined;

    render(<GoogleOneTap />);

    expect(oneTap).not.toHaveBeenCalled();
  });

  it('swallows a blocked Google script', async () => {
    oneTap.mockRejectedValue(new Error('Failed to load Google Identity Services script'));

    const { container } = render(<GoogleOneTap />);

    await waitFor(() => expect(oneTap).toHaveBeenCalledOnce());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('continuationPath', () => {
  it('reloads the login page itself so its mode and callback survive', () => {
    expect(continuationPath({ pathname: '/login', search: '?mode=designer' })).toBe(
      '/login?mode=designer',
    );
  });

  it('sends the landing page through login with itself as the callback', () => {
    expect(continuationPath({ pathname: '/', search: '' })).toBe('/login?callbackURL=%2F');
  });
});
