import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/config', () => ({
  config: {
    RESEND_API_KEY: 're_test_only',
    EMAIL_FROM: 'Tickif <hello@tickif.example>',
    NODE_ENV: 'test',
  },
}));

const email = {
  to: 'designer@example.com',
  subject: 'Ownership updated',
  html: '<p>Ownership updated</p>',
  text: 'Ownership updated',
};

describe('email delivery through the installed Resend SDK', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('RESEND_BASE_URL', 'https://api.resend.com');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sends rendered content with the retry idempotency header', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'email-1' }));
    const { sendEmail } = await import('../src/email.js');

    await sendEmail({ ...email, idempotencyKey: 'transfer-1' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toBe('https://api.resend.com/emails');
    expect(request?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      from: 'Tickif <hello@tickif.example>',
      ...email,
    });
    const headers = new Headers(request?.[1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer re_test_only');
    expect(headers.get('idempotency-key')).toBe('transfer-1');
  });

  it('propagates a provider response error so the queue can retry', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { name: 'application_error', message: 'Provider unavailable' },
        { status: 503 },
      ),
    );
    const { sendEmail } = await import('../src/email.js');

    await expect(sendEmail(email)).rejects.toThrow('Provider unavailable');
  });

  it('propagates a transport failure so the queue can retry', async () => {
    fetchMock.mockRejectedValue(new TypeError('Connection closed'));
    const { sendEmail } = await import('../src/email.js');

    await expect(sendEmail(email)).rejects.toThrow('Unable to fetch data');
  });
});
