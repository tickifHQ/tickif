import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WhatsappContactVerification } from '../../src/components/whatsapp-contact-verification';

const mock = vi.hoisted(() => ({ send: vi.fn(), verify: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: { api: { whatsapp: { send: { $post: mock.send }, verify: { $post: mock.verify } } } },
}));
beforeEach(() => vi.clearAllMocks());
describe('WhatsApp contact verification', () => {
  it('sends and verifies a code for the exact contact target', async () => {
    const user = userEvent.setup();
    const verified = vi.fn();
    mock.send.mockResolvedValue(Response.json({ challengeId: 'challenge' }));
    mock.verify.mockResolvedValue(Response.json({ verificationId: 'proof' }));
    render(
      <WhatsappContactVerification
        phoneNumber="+919800000001"
        target="personal"
        onVerified={verified}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Verify WhatsApp number' }));
    expect(mock.send).toHaveBeenCalledWith({
      json: { phoneNumber: '+919800000001', target: 'personal' },
    });
    await user.type(screen.getByRole('textbox', { name: 'OTP digit 1' }), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('status')).toHaveTextContent('WhatsApp verified');
    expect(verified).toHaveBeenCalledWith({
      phoneNumber: '+919800000001',
      verificationId: 'proof',
    });
  });
  it('shows a retryable delivery error', async () => {
    const user = userEvent.setup();
    mock.send.mockResolvedValue(
      Response.json({ error: { message: 'Delivery unavailable' } }, { status: 502 }),
    );
    render(
      <WhatsappContactVerification
        phoneNumber="+919800000001"
        target="onboarding"
        onVerified={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Verify WhatsApp number' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Delivery unavailable');
  });
});
