import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from '../../../src/modules/billing/webhook-service.js';

const TEST_SECRET = 'whsec_test_secret_for_unit_tests';

function generateSignature(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('E-117: webhook signature verification', () => {
  const body = JSON.stringify({ event: 'subscription.charged', payload: {} });

  it('accepts a valid signature', () => {
    const sig = generateSignature(body, TEST_SECRET);
    expect(verifyWebhookSignature(body, sig, TEST_SECRET)).toBe(true);
  });

  it('rejects a null signature', () => {
    expect(verifyWebhookSignature(body, null, TEST_SECRET)).toBe(false);
  });

  it('rejects an undefined signature', () => {
    expect(verifyWebhookSignature(body, undefined, TEST_SECRET)).toBe(false);
  });

  it('rejects an empty string signature', () => {
    expect(verifyWebhookSignature(body, '', TEST_SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const sig = generateSignature(body, TEST_SECRET);
    const tamperedBody = body.replace('charged', 'halted');
    expect(verifyWebhookSignature(tamperedBody, sig, TEST_SECRET)).toBe(false);
  });

  it('rejects a signature from a different secret', () => {
    const sig = generateSignature(body, 'wrong_secret');
    expect(verifyWebhookSignature(body, sig, TEST_SECRET)).toBe(false);
  });

  it('rejects a malformed hex signature', () => {
    expect(verifyWebhookSignature(body, 'not-valid-hex!@#$', TEST_SECRET)).toBe(false);
  });

  it('rejects a signature with wrong length', () => {
    expect(verifyWebhookSignature(body, 'abcdef', TEST_SECRET)).toBe(false);
  });
});
