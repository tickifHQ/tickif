import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VisitorOnboardingForm } from '../../src/components/visitor-onboarding-form';
import { VISITOR_ONBOARDING_STORAGE_KEY } from '../../src/lib/visitor-onboarding';

const mock = vi.hoisted(() => ({
  updateUser: vi.fn(),
  router: {
    push: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    updateUser: mock.updateUser,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mock.router,
}));

describe('VisitorOnboardingForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.updateUser.mockResolvedValue({ data: { status: true }, error: null });
    window.localStorage.clear();
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

  it('persists the display name and stores the remaining visitor preferences', async () => {
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
    expect(JSON.parse(window.localStorage.getItem(VISITOR_ONBOARDING_STORAGE_KEY) ?? '{}')).toEqual(
      {
        displayName: 'Sarthak Wade',
        address: '12 Studio Lane, Chennai',
        phoneNumber: '+919123456789',
        whatsapp: '+919123456789',
      },
    );
    expect(mock.router.push).toHaveBeenCalledWith('/');
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
    expect(window.localStorage.getItem(VISITOR_ONBOARDING_STORAGE_KEY)).toBeNull();
    expect(mock.router.push).not.toHaveBeenCalled();
  });
});
