import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import userEvent from '@testing-library/user-event';
import type { BookingResponse, ListBookingsResponse } from '@repo/contracts';
import { BookingForm, BookingCta } from '../../src/components/booking-cta';
import { ConsultationList } from '../../src/components/consultation-list';
import { UserFacingError } from '../../src/lib/user-facing-error';

const mock = vi.hoisted(() => ({
  requestConsultation: vi.fn(),
  confirmConsultation: vi.fn(),
  cancelConsultation: vi.fn(),
  completeConsultation: vi.fn(),
  refresh: vi.fn(),
  session: null as unknown,
  isPending: false,
}));
vi.mock('@/lib/bookings-api', () => mock);
vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => ({ data: mock.session, isPending: mock.isPending }) },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
const profileId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const booking: BookingResponse = {
  id: '33333333-3333-4333-8333-333333333333',
  status: 'requested',
  organization: { id: 'org', name: 'Studio', slug: 'studio' },
  designerProfile: { id: profileId, displayName: 'Studio', slug: 'custom-studio', logoUrl: null },
  requester: {
    id: 'visitor',
    name: 'Visitor',
    email: 'visitor@example.test',
    phoneNumber: '+919800009001',
  },
  referredProject: null,
  preferredSlots: [{ date: '2026-10-01', window: 'morning' }],
  confirmedSlot: null,
  message: 'Kitchen plans',
  requestedAt: '2026-09-05T01:00:00Z',
  confirmedAt: null,
  completedAt: null,
  cancelledAt: null,
  cancelledBy: null,
  cancelledByUserId: null,
  cancelReason: null,
  createdAt: '2026-09-05T01:00:00Z',
  updatedAt: '2026-09-05T01:00:00Z',
  reviewEligible: false,
};
const page = (item: BookingResponse = booking): ListBookingsResponse => ({
  items: [item],
  page: 1,
  limit: 12,
  total: 1,
  totalPages: 1,
});
beforeEach(() => {
  vi.clearAllMocks();
  mock.session = null;
  mock.isPending = false;
});

describe('consultation request', () => {
  it('enables the server-rendered project CTA when hydration starts with a cached session', async () => {
    const props = {
      designerProfileId: profileId,
      designerName: 'Studio',
      referredProjectId: projectId,
      loginHref: '/login?callbackUrl=%2Fprojects%2Fexample',
    };
    mock.isPending = true;
    const container = document.createElement('div');
    container.innerHTML = renderToString(<BookingCta {...props} />);
    document.body.append(container);
    expect(container.querySelector('button')).toBeDisabled();
    mock.isPending = false;
    mock.session = {
      user: { id: 'visitor', role: 'visitor', phoneNumberVerified: true },
      session: { activeOrganizationId: null },
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = hydrateRoot(container, <BookingCta {...props} />);
    try {
      await waitFor(() => expect(container.querySelector('button')).toBeEnabled());
      await userEvent.click(screen.getByRole('button', { name: 'Book consultation' }));
      expect(await screen.findByRole('dialog', { name: 'Consultation with Studio' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Request consultation' })).toBeEnabled();
      expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/hydrat/i);
    } finally {
      await act(() => root.unmount());
      consoleError.mockRestore();
      container.remove();
    }
  });
  it('submits three IST choices with project context and shows persisted pending confirmation', async () => {
    const user = userEvent.setup();
    render(<BookingForm designerProfileId={profileId} referredProjectId={projectId} />);
    await user.click(screen.getByRole('button', { name: 'Add another time' }));
    await user.click(screen.getByRole('button', { name: 'Add another time' }));
    expect(screen.queryByRole('button', { name: 'Add another time' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Time window 2'), 'evening');
    await user.type(
      screen.getByLabelText('What would you like to discuss? (optional)'),
      'A kitchen renovation',
    );
    await user.click(screen.getByRole('button', { name: 'Request consultation' }));
    expect(mock.requestConsultation).toHaveBeenCalledWith(
      expect.objectContaining({
        designerProfileId: profileId,
        referredProjectId: projectId,
        message: 'A kitchen renovation',
        preferredSlots: expect.arrayContaining([expect.objectContaining({ window: 'evening' })]),
      }),
    );
    expect(mock.requestConsultation.mock.calls[0]?.[0].preferredSlots).toHaveLength(3);
    expect(await screen.findByRole('status')).toHaveTextContent('Waiting for the studio');
    expect(screen.getByRole('link', { name: 'View my consultations' })).toHaveAttribute(
      'href',
      '/home/consultations',
    );
  });
  it('retains entered details after an authoritative server rejection', async () => {
    mock.requestConsultation.mockRejectedValueOnce(
      new UserFacingError('You already have three open consultations with this designer'),
    );
    const user = userEvent.setup();
    render(<BookingForm designerProfileId={profileId} />);
    await user.type(
      screen.getByLabelText('What would you like to discuss? (optional)'),
      'Keep these plans',
    );
    await user.click(screen.getByRole('button', { name: 'Request consultation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('three open consultations');
    expect(screen.getByLabelText('What would you like to discuss? (optional)')).toHaveValue(
      'Keep these plans',
    );
  });
  it('validates duplicate preferences before making a request', async () => {
    const user = userEvent.setup();
    render(<BookingForm designerProfileId={profileId} />);
    await user.click(screen.getByRole('button', { name: 'Add another time' }));
    fireEvent.change(screen.getByLabelText('Date 2'), {
      target: { value: (screen.getByLabelText('Date 1') as HTMLInputElement).value },
    });
    await user.click(screen.getByRole('button', { name: 'Request consultation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('unique');
    expect(mock.requestConsultation).not.toHaveBeenCalled();
  });
  it('preserves the public login callback', async () => {
    const user = userEvent.setup();
    render(
      <BookingCta
        designerProfileId={profileId}
        designerName="Studio"
        loginHref="/login?callbackUrl=%2Fd%2Fstudio"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Book consultation' }));
    expect(screen.getByRole('link', { name: 'Sign in to book' })).toHaveAttribute(
      'href',
      '/login?callbackUrl=%2Fd%2Fstudio',
    );
  });
});
describe('consultation lifecycle', () => {
  it('confirms a proposed slot using the rendered status', async () => {
    const user = userEvent.setup();
    render(<ConsultationList data={page()} scope="inbox" canWrite />);
    await user.click(screen.getByRole('button', { name: 'Confirm consultation' }));
    expect(mock.confirmConsultation).toHaveBeenCalledWith(booking.id, 'requested', {
      confirmedSlot: booking.preferredSlots[0],
    });
    expect(mock.refresh).toHaveBeenCalled();
  });
  it('requires cancellation reason and retains it when stale', async () => {
    mock.cancelConsultation.mockRejectedValueOnce(
      new UserFacingError('Booking changed; refresh and try again'),
    );
    const user = userEvent.setup();
    render(<ConsultationList data={page()} scope="mine" canWrite />);
    expect(screen.queryByText(/visitor@example/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel consultation' }));
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    expect(mock.cancelConsultation).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Cancellation reason'), 'Travel plans');
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    expect(mock.cancelConsultation).toHaveBeenCalledWith(booking.id, 'requested', {
      reason: 'Travel plans',
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Booking changed');
    expect(screen.getByLabelText('Cancellation reason')).toHaveValue('Travel plans');
  });
  it('offers completion only to writers and links completed bookings to the canonical review route', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ConsultationList
        data={page({ ...booking, status: 'confirmed', confirmedSlot: booking.preferredSlots[0]! })}
        scope="inbox"
        canWrite={false}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Mark completed' })).not.toBeInTheDocument();
    rerender(
      <ConsultationList
        data={page({ ...booking, status: 'confirmed', confirmedSlot: booking.preferredSlots[0]! })}
        scope="inbox"
        canWrite
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Mark completed' }));
    await user.click(screen.getByRole('button', { name: 'Confirm completion' }));
    expect(mock.completeConsultation).toHaveBeenCalledWith(booking.id, 'confirmed');
    rerender(
      <ConsultationList
        data={page({ ...booking, status: 'completed', reviewEligible: true })}
        scope="mine"
        canWrite
      />,
    );
    expect(screen.getByRole('link', { name: 'Review consultation' })).toHaveAttribute(
      'href',
      `/d/custom-studio?bookingId=${booking.id}#tickif-reviews`,
    );
    expect(screen.queryByRole('button', { name: 'Cancel consultation' })).not.toBeInTheDocument();
  });
});
