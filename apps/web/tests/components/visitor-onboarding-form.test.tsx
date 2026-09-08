import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VisitorOnboardingForm } from '../../src/components/visitor-onboarding-form';

const mock = vi.hoisted(() => ({
  updateUser: vi.fn(),
  getSession: vi.fn(),
  upsertVisitor: vi.fn(),
  router: {
    replace: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    updateUser: mock.updateUser,
    getSession: mock.getSession,
  },
}));

vi.mock('@/lib/api', () => ({
  api: { api: { visitors: { me: { $put: mock.upsertVisitor } } } },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mock.router,
}));

describe('VisitorOnboardingForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.updateUser.mockResolvedValue({ data: { status: true }, error: null });
    mock.getSession.mockResolvedValue({ data: null, error: null });
    mock.upsertVisitor.mockResolvedValue(
      new Response(
        JSON.stringify({
          address: '12 Studio Lane, Chennai',
          whatsappNumber: '+919123456789',
          onboardingCompletedAt: '2026-09-08T07:00:00.000Z',
          createdAt: '2026-09-08T07:00:00.000Z',
          updatedAt: '2026-09-08T07:00:00.000Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  });

  it('copies the signed-in phone number into WhatsApp when selected', async () => {
    const user = userEvent.setup();
    render(
      <VisitorOnboardingForm
        displayName=""
        signedInAs="+919123456789"
        initialPhoneNumber="+919123456789"
      />,
    );

    const avatar = screen.getByRole('img', { name: 'Generated visitor initials' });
    expect(avatar.parentElement).toHaveClass('aspect-square', 'self-stretch');
    expect(screen.queryByText('x')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Your name')).toBeRequired();
    expect(screen.getByPlaceholderText('Your name')).toHaveAttribute('minlength', '2');
    expect(screen.getByPlaceholderText('Your name')).toHaveAttribute('maxlength', '100');
    expect(screen.getByLabelText(/^address$/i)).toHaveAttribute('maxlength', '300');
    expect(screen.getByLabelText(/^phone number$/i)).toHaveValue('+919123456789');
    expect(screen.getByLabelText(/^phone number$/i)).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/whatsapp number/i)).toHaveValue('');

    await user.click(screen.getByRole('checkbox', { name: /use phone number for whatsapp/i }));

    expect(screen.getByLabelText(/whatsapp number/i)).toHaveValue('+919123456789');
  });

  it('keeps the phone field editable when the account has no authenticated phone number', () => {
    render(
      <VisitorOnboardingForm
        displayName="Sarthak Wade"
        signedInAs="sarthak@example.com"
        initialPhoneNumber=""
      />,
    );

    expect(screen.getByLabelText(/^phone number$/i)).not.toHaveAttribute('readonly');
  });

  it('persists onboarding through the visitor API before entering personal home', async () => {
    const user = userEvent.setup();
    render(
      <VisitorOnboardingForm
        displayName=""
        signedInAs="+919123456789"
        initialPhoneNumber="+919123456789"
      />,
    );

    await user.type(screen.getByLabelText(/display name/i), 'Sarthak Wade');
    await user.type(screen.getByLabelText(/^address$/i), '12 Studio Lane, Chennai');
    await user.click(screen.getByRole('checkbox', { name: /use phone number for whatsapp/i }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(mock.updateUser).toHaveBeenCalledWith({ name: 'Sarthak Wade' });
    expect(mock.upsertVisitor).toHaveBeenCalledWith({
      json: {
        address: '12 Studio Lane, Chennai',
        whatsappNumber: '+919123456789',
      },
    });
    expect(mock.getSession).toHaveBeenCalledWith({ query: { disableCookieCache: true } });
    expect(mock.router.replace).toHaveBeenCalledWith('/home');
    expect(mock.router.refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the visitor on onboarding when the name cannot be persisted', async () => {
    mock.updateUser.mockResolvedValue({
      data: null,
      error: { message: 'Update failed' },
    });
    const user = userEvent.setup();
    render(
      <VisitorOnboardingForm
        displayName=""
        signedInAs="+919123456789"
        initialPhoneNumber="+919123456789"
      />,
    );

    await user.type(screen.getByLabelText(/display name/i), 'Sarthak Wade');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Update failed');
    expect(mock.upsertVisitor).not.toHaveBeenCalled();
    expect(mock.router.replace).not.toHaveBeenCalled();
  });

  it('keeps the visitor on onboarding when profile persistence fails', async () => {
    mock.upsertVisitor.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Could not save visitor profile' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const user = userEvent.setup();
    render(
      <VisitorOnboardingForm
        displayName=""
        signedInAs="+919123456789"
        initialPhoneNumber="+919123456789"
      />,
    );

    await user.type(screen.getByLabelText(/display name/i), 'Sarthak Wade');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save visitor profile');
    expect(mock.router.replace).not.toHaveBeenCalled();
  });
});
