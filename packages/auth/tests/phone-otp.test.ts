import type * as ConfigModule from '@repo/config';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const { settings, enqueueSms } = vi.hoisted(() => ({
  settings: {
    WHATSAPP_PROVIDER: 'msg91',
    MSG91_KEY: 'test-key',
    MSG91_WHATSAPP_NUMBER: '17115008251',
    MSG91_WHATSAPP_TEMPLATE: 'login_code',
    MSG91_WHATSAPP_LANGUAGE: 'en',
    NODE_ENV: 'test',
    TELEMETRY_ENABLED: false,
  },
  enqueueSms: vi.fn(),
}));
vi.mock('@repo/config', async (original) => ({
  ...(await original<typeof ConfigModule>()),
  config: settings,
}));
vi.mock('@repo/queue', () => ({ enqueueSms }));
import { sendPhoneOtp } from '../src/phone-otp.js';
const input = { phoneNumber: '+919800000010', code: '123456' };
beforeEach(() => {
  vi.clearAllMocks();
  settings.WHATSAPP_PROVIDER = 'msg91';
});
afterEach(() => vi.unstubAllGlobals());
describe('WhatsApp OTP delivery', () => {
  it('sends the supplied code to the entered WhatsApp number', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'success' })));
    vi.stubGlobal('fetch', request);
    await sendPhoneOtp(input);
    const body = JSON.parse(request.mock.calls[0]![1].body);
    expect(body.integrated_number).toBe('17115008251');
    expect(body.payload.template.to_and_components[0]).toEqual({
      to: ['919800000010'],
      components: {
        body_1: { type: 'text', value: '123456' },
        button_1: { subtype: 'url', type: 'text', value: '123456' },
      },
    });
    expect(enqueueSms).not.toHaveBeenCalled();
  });
  it('rejects unsuccessful provider acknowledgements', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ status: 'error', message: 'sensitive' }))),
    );
    await expect(sendPhoneOtp(input)).rejects.toThrow('was not accepted');
  });
  it('redacts provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('test-key 123456')));
    await expect(sendPhoneOtp(input)).rejects.toThrow(/^WhatsApp OTP delivery failed$/);
  });
  it('rejects invalid phone numbers before making requests', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(sendPhoneOtp({ ...input, phoneNumber: '9800000010' })).rejects.toThrow('Invalid');
    expect(request).not.toHaveBeenCalled();
  });
  it('uses only the isolated local queue in console mode', async () => {
    settings.WHATSAPP_PROVIDER = 'console';
    await sendPhoneOtp(input);
    expect(enqueueSms).toHaveBeenCalledWith(input);
  });
});
