import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/index.js';

describe('optional billing credentials', () => {
  it('treats explicitly blank credentials as unconfigured for isolated test runners', () => {
    const config = parseConfig({
      NODE_ENV: 'test',
      BETTER_AUTH_URL: 'http://localhost:3000',
      BETTER_AUTH_SECRET: 'test-billing-config-secret',
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
    });
    expect(config.RAZORPAY_KEY_ID).toBeUndefined();
    expect(config.RAZORPAY_KEY_SECRET).toBeUndefined();
  });
});
