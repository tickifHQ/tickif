import { screen, waitFor, within } from '@testing-library/react';
import { expect } from 'vitest';
import type userEvent from '@testing-library/user-event';

export async function verifyWhatsappContact(
  user: ReturnType<typeof userEvent.setup>,
  phone: string,
) {
  await user.click(screen.getByRole('button', { name: 'Edit WhatsApp number' }));
  const dialog = screen.getByRole('dialog');
  const input = within(dialog).getByRole('textbox', { name: 'Phone number' });
  await user.clear(input);
  await user.type(input, phone);
  await user.click(within(dialog).getByRole('button', { name: 'Send OTP' }));
  await user.type(within(dialog).getByRole('textbox', { name: 'OTP digit 1' }), '123456');
  await user.click(within(dialog).getByRole('button', { name: 'Verify' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}
