import { assertWhatsappConfig, config } from '@repo/config';
import { enqueueSms } from '@repo/queue';

/** Better Auth owns login codes; contact challenges use the same delivery adapter. */
export async function sendPhoneOtp(input: { phoneNumber: string; code: string }): Promise<void> {
  if (!/^\+[1-9]\d{7,14}$/.test(input.phoneNumber) || !/^\d{6}$/.test(input.code))
    throw new Error('Invalid WhatsApp OTP input');
  assertWhatsappConfig(config);
  if (config.WHATSAPP_PROVIDER === 'console') {
    await enqueueSms(input);
    return;
  }
  let response: Response;
  try {
    response = await fetch(
      'https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authkey: config.MSG91_KEY! },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          integrated_number: config.MSG91_WHATSAPP_NUMBER,
          content_type: 'template',
          payload: {
            messaging_product: 'whatsapp',
            type: 'template',
            template: {
              name: config.MSG91_WHATSAPP_TEMPLATE,
              language: { code: config.MSG91_WHATSAPP_LANGUAGE, policy: 'deterministic' },
              to_and_components: [
                {
                  to: [input.phoneNumber.slice(1)],
                  components: {
                    body_1: { type: 'text', value: input.code },
                    button_1: { subtype: 'url', type: 'text', value: input.code },
                  },
                },
              ],
            },
          },
        }),
      },
    );
  } catch {
    throw new Error('WhatsApp OTP delivery failed');
  }
  if (!response.ok) throw new Error('WhatsApp OTP delivery rejected');
  const result: unknown = await response.json().catch(() => null);
  if (
    !result ||
    typeof result !== 'object' ||
    !('status' in result) ||
    result.status !== 'success' ||
    ('hasError' in result && result.hasError === true)
  )
    throw new Error('WhatsApp OTP delivery was not accepted');
}
