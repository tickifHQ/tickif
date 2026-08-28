import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: null as {
    user: { id: string; email: string; phoneNumber: string | null };
  } | null,
  checkEnquiry: vi.fn(),
  createEnquiry: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: mocks.session, isPending: false }),
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      enquiries: {
        check: { $get: mocks.checkEnquiry },
        $post: mocks.createEnquiry,
      },
    },
  },
}));

const { EnquiryAvailabilityProvider, EnquiryCta } =
  await import('../../src/components/enquiry-cta');

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
  beforeEach(() => {
    mocks.checkEnquiry.mockResolvedValue({
      ok: true,
      json: async () => ({
        canEnquire: true,
        unavailableReason: null,
        exists: false,
        enquiryId: null,
      }),
    });
    mocks.createEnquiry.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: '33333333-3333-4333-8333-333333333333',
      }),
    });
  });

  afterEach(() => {
    mocks.session = null;
    vi.clearAllMocks();
  });

  it('opens the enquiry form in place for a signed-in visitor', async () => {
    mocks.session = {
      user: {
        id: 'visitor-1',
        email: 'homeowner@example.com',
        phoneNumber: '+919876543210',
      },
    };

    render(<EnquiryCta {...props}>Enquire</EnquiryCta>);
    fireEvent.click(screen.getByRole('button', { name: 'Enquire with Studio North' }));

    await waitFor(() =>
      expect(mocks.checkEnquiry).toHaveBeenCalledWith({
        query: { designerProfileId: props.designerProfileId },
      }),
    );
    expect(await screen.findByRole('dialog', { name: 'Send an Enquiry' })).toBeInTheDocument();
    expect(screen.getByText('Studio North')).toBeInTheDocument();
  });

  it('hydrates safely when the browser already has a signed-in session', async () => {
    mocks.session = null;
    const serverHtml = renderToString(<EnquiryCta {...props}>Enquire</EnquiryCta>);
    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.append(container);

    mocks.session = {
      user: { id: 'visitor-1', email: 'homeowner@example.com', phoneNumber: null },
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

  it("does not open the form when the API identifies the caller's own studio", async () => {
    mocks.session = {
      user: {
        id: 'designer-1',
        email: 'designer@example.com',
        phoneNumber: '+919876543210',
      },
    };
    mocks.checkEnquiry.mockResolvedValue({
      ok: true,
      json: async () => ({
        canEnquire: false,
        unavailableReason: 'own_studio',
        exists: false,
        enquiryId: null,
      }),
    });

    render(<EnquiryCta {...props}>Enquire</EnquiryCta>);
    const button = screen.getByRole('button', { name: 'Enquire with Studio North' });
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.queryByRole('dialog', { name: 'Send an Enquiry' })).not.toBeInTheDocument();
  });

  it("shares one eligibility check and disables every CTA on the caller's own studio", async () => {
    mocks.session = {
      user: {
        id: 'designer-1',
        email: 'designer@example.com',
        phoneNumber: '+919876543210',
      },
    };
    mocks.checkEnquiry.mockResolvedValue({
      ok: true,
      json: async () => ({
        canEnquire: false,
        unavailableReason: 'own_studio',
        exists: false,
        enquiryId: null,
      }),
    });

    render(
      <EnquiryAvailabilityProvider designerProfileId={props.designerProfileId}>
        <EnquiryCta {...props}>Enquire</EnquiryCta>
        <EnquiryCta {...props} ariaLabel="Start a conversation">
          Start a conversation
        </EnquiryCta>
      </EnquiryAvailabilityProvider>,
    );

    const enquire = await screen.findByRole('button', {
      name: 'Enquire with Studio North',
    });
    const conversation = screen.getByRole('button', { name: 'Start a conversation' });
    await waitFor(() => {
      expect(enquire).toBeDisabled();
      expect(conversation).toBeDisabled();
    });
    expect(enquire).toHaveAttribute('title', 'You cannot enquire with your own studio');
    expect(mocks.checkEnquiry).toHaveBeenCalledTimes(1);
  });

  it('updates every shared CTA after an enquiry is submitted', async () => {
    mocks.session = {
      user: {
        id: 'visitor-1',
        email: 'homeowner@example.com',
        phoneNumber: '+919876543210',
      },
    };

    render(
      <EnquiryAvailabilityProvider designerProfileId={props.designerProfileId}>
        <EnquiryCta {...props}>Enquire</EnquiryCta>
        <EnquiryCta {...props} ariaLabel="Start a conversation">
          Start a conversation
        </EnquiryCta>
      </EnquiryAvailabilityProvider>,
    );

    const enquire = await screen.findByRole('button', {
      name: 'Enquire with Studio North',
    });
    await waitFor(() => expect(enquire).toBeEnabled());
    fireEvent.click(enquire);

    fireEvent.change(await screen.findByLabelText(/Description/), {
      target: { value: 'I would like to discuss a renovation.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send Enquiry' }));

    expect(await screen.findByText('Enquiry sent successfully!')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start a conversation' }));

    expect(await screen.findByRole('dialog', { name: 'Enquiry already sent' })).toBeInTheDocument();
    expect(mocks.checkEnquiry).toHaveBeenCalledTimes(1);
    expect(mocks.createEnquiry).toHaveBeenCalledTimes(1);
  });
});
