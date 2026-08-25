import { act, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: null as {
    user: { email: string; phoneNumber: string | null };
  } | null,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: mocks.session, isPending: false }),
  },
}));

const { EnquiryCta } = await import('../../src/components/enquiry-cta');

const props = {
  context: {
    type: 'designer' as const,
    designerName: 'Studio North',
  },
  designerProfileId: '11111111-1111-4111-8111-111111111111',
  loginHref: '/login?callbackURL=%2Fprojects%2F22222222-2222-4222-8222-222222222222',
  ariaLabel: 'Enquire with Studio North',
};

describe('EnquiryCta', () => {
  afterEach(() => {
    mocks.session = null;
  });

  it('hydrates safely when the browser already has a signed-in session', async () => {
    mocks.session = null;
    const serverHtml = renderToString(<EnquiryCta {...props}>Enquire</EnquiryCta>);
    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.append(container);

    mocks.session = {
      user: { email: 'homeowner@example.com', phoneNumber: null },
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = hydrateRoot(container, <EnquiryCta {...props}>Enquire</EnquiryCta>);

    await waitFor(() =>
      expect(
        container.querySelector('button[aria-label="Enquire with Studio North"]'),
      ).not.toBeNull(),
    );
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('Hydration failed');

    await act(() => root.unmount());
    consoleError.mockRestore();
    container.remove();
  });
});
