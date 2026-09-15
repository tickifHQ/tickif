import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock('../src/email.js', () => ({ sendEmail }));

import { sendNotificationEmail } from '../src/notification-email.js';

const message = {
  to: 'designer@example.com',
  subject: 'Studio invitation',
  html: '<p>Invitation</p>',
  text: 'Invitation',
};

describe('sendNotificationEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sendEmail.mockReset();
  });

  it('reports successful delivery', async () => {
    sendEmail.mockResolvedValue(undefined);

    await expect(sendNotificationEmail('organization-invitation', message)).resolves.toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(message);
  });

  it('keeps the organization action successful when delivery fails', async () => {
    sendEmail.mockRejectedValue(new Error('provider unavailable'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(sendNotificationEmail('organization-invitation-declined', message)).resolves.toBe(
      false,
    );
    expect(error).toHaveBeenCalledWith('[email] organization-invitation-declined delivery failed');
  });
});
