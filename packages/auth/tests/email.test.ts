import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTickifEmail } from '../src/email-templates.js';

const { send, settings } = vi.hoisted(() => ({
  send: vi.fn(),
  settings: {
    RESEND_API_KEY: 'test-key',
    EMAIL_FROM: 'Tickif <hello@tickif.example>',
    NODE_ENV: 'test',
  },
}));
vi.mock('@repo/config', () => ({ config: settings }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

describe('Resend delivery', () => {
  beforeEach(() => {
    vi.resetModules();
    send.mockReset();
    settings.RESEND_API_KEY = 'test-key';
    settings.NODE_ENV = 'test';
  });

  it('delivers rendered HTML and plain text with retry idempotency', async () => {
    send.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const { sendEmail } = await import('../src/email.js');
    const body = await renderTickifEmail({ kind: 'ownership-new' }, 'https://tickif.example');
    await sendEmail({
      to: 'designer@example.com',
      subject: 'Ownership updated',
      ...body,
      idempotencyKey: 'transfer-1',
    });
    expect(send).toHaveBeenCalledWith(
      {
        from: settings.EMAIL_FROM,
        to: 'designer@example.com',
        subject: 'Ownership updated',
        ...body,
      },
      { idempotencyKey: 'transfer-1' },
    );
  });

  it('propagates provider errors so callers can retry', async () => {
    send.mockResolvedValue({ error: { message: 'Provider unavailable' } });
    const { sendEmail } = await import('../src/email.js');
    await expect(
      sendEmail({
        to: 'designer@example.com',
        subject: 'Update',
        html: '<p>Update</p>',
        text: 'Update',
      }),
    ).rejects.toThrow('Provider unavailable');
  });

  it('never logs authentication codes in development fallback', async () => {
    settings.RESEND_API_KEY = '';
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const { sendEmail } = await import('../src/email.js');
      await sendEmail({
        to: 'designer@example.com',
        subject: 'Login code',
        html: '<p>123456</p>',
        text: '123456',
      });
      expect(send).not.toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain('123456');
    } finally {
      log.mockRestore();
    }
  });
});
