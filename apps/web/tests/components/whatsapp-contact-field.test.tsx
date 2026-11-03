import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  WhatsappContactField,
  type WhatsappContactProof,
} from '../../src/components/whatsapp-contact-field';

const mock = vi.hoisted(() => ({ send: vi.fn(), verify: vi.fn(), committed: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: { api: { whatsapp: { send: { $post: mock.send }, verify: { $post: mock.verify } } } },
}));
function Field({ initial = '+919800000001' }: { initial?: string }) {
  const [number, setNumber] = useState(initial);
  return (
    <WhatsappContactField
      ariaLabel="Saved WhatsApp number"
      phoneNumber={number}
      target="onboarding"
      onVerified={(proof: WhatsappContactProof) => {
        mock.committed(proof);
        setNumber(proof.phoneNumber);
      }}
      onClear={() => setNumber('')}
    />
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.send.mockResolvedValue(Response.json({ challengeId: 'challenge' }));
  mock.verify.mockResolvedValue(Response.json({ verificationId: 'proof' }));
});
async function enterNumber(value = '9876543210') {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Edit WhatsApp number' }));
  const dialog = screen.getByRole('dialog');
  const phone = within(dialog).getByRole('textbox', { name: 'Phone number' });
  await user.clear(phone);
  await user.type(phone, value);
  return { user, dialog };
}
describe('verified WhatsApp contact field', () => {
  it('opens international contacts with the correct country and national number', async () => {
    const user = userEvent.setup();
    render(<Field initial="+4915112345678" />);
    await user.click(screen.getByRole('button', { name: 'Edit WhatsApp number' }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('button', { name: /Country code, Germany \+49/ }),
    ).toBeVisible();
    expect(within(dialog).getByRole('textbox', { name: 'Phone number' })).toHaveValue(
      '15112345678',
    );
  });
  it('keeps the number read-only and commits only after exact-number OTP verification', async () => {
    render(<Field />);
    expect(screen.getByLabelText('Saved WhatsApp number')).toHaveAttribute('readonly');
    const { user, dialog } = await enterNumber();
    expect(screen.getByLabelText('Saved WhatsApp number')).toHaveValue('+919800000001');
    await user.click(within(dialog).getByRole('button', { name: 'Send OTP' }));
    expect(mock.send).toHaveBeenCalledWith({
      json: { phoneNumber: '+919876543210', target: 'onboarding' },
    });
    expect(mock.committed).not.toHaveBeenCalled();
    await user.type(within(dialog).getByRole('textbox', { name: 'OTP digit 1' }), '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Verify' }));
    expect(mock.verify).toHaveBeenCalledWith({
      json: {
        phoneNumber: '+919876543210',
        target: 'onboarding',
        challengeId: 'challenge',
        code: '123456',
      },
    });
    expect(mock.committed).toHaveBeenCalledWith({
      phoneNumber: '+919876543210',
      verificationId: 'proof',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Saved WhatsApp number')).toHaveValue('+919876543210');
  });
  it('discards a cancelled edit and restores focus to the pencil', async () => {
    render(<Field />);
    const { user, dialog } = await enterNumber();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.getByLabelText('Saved WhatsApp number')).toHaveValue('+919800000001');
    expect(mock.committed).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Edit WhatsApp number' })).toHaveFocus();
  });
  it('shows delivery errors without changing the current number', async () => {
    mock.send.mockResolvedValue(
      Response.json({ error: { message: 'Delivery unavailable' } }, { status: 502 }),
    );
    render(<Field />);
    const { user, dialog } = await enterNumber();
    await user.click(within(dialog).getByRole('button', { name: 'Send OTP' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Delivery unavailable');
    expect(screen.getByLabelText('Saved WhatsApp number')).toHaveValue('+919800000001');
    expect(mock.committed).not.toHaveBeenCalled();
  });
  it('keeps wrong codes in the dialog and prevents immediate resend', async () => {
    mock.verify.mockResolvedValue(
      Response.json({ error: { message: 'Invalid code' } }, { status: 422 }),
    );
    render(<Field />);
    const { user, dialog } = await enterNumber();
    await user.click(within(dialog).getByRole('button', { name: 'Send OTP' }));
    expect(within(dialog).getByRole('button', { name: /Resend in/ })).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'OTP digit 1' }), '000000');
    await user.click(within(dialog).getByRole('button', { name: 'Verify' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Invalid code');
    expect(mock.committed).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Saved WhatsApp number')).toHaveValue('+919800000001');
  });
  it('keeps invalid numbers local and permits optional removal', async () => {
    render(<Field />);
    const { user, dialog } = await enterNumber('123');
    expect(within(dialog).getByRole('button', { name: 'Send OTP' })).toBeDisabled();
    expect(mock.send).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Remove number' }));
    expect(screen.getByLabelText('Saved WhatsApp number')).toHaveValue('');
  });
});
