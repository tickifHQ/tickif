import { describe, expect, it } from 'vitest';
import {
  hasPaidPlan,
  RAZORPAY_PLAN_CONFIG,
} from '../../../src/modules/billing/razorpay-client.js';

describe('billing / razorpay-client', () => {
  describe('plan mapping', () => {
    it('professional_plus maps to ₹2,999 = 299900 paise', () => {
      expect(RAZORPAY_PLAN_CONFIG.professional_plus.amountPaise).toBe(299900);
      expect(RAZORPAY_PLAN_CONFIG.professional_plus.currency).toBe('INR');
      expect(RAZORPAY_PLAN_CONFIG.professional_plus.period).toBe('monthly');
    });

    it('corporate maps to ₹7,999 = 799900 paise', () => {
      expect(RAZORPAY_PLAN_CONFIG.corporate.amountPaise).toBe(799900);
      expect(RAZORPAY_PLAN_CONFIG.corporate.currency).toBe('INR');
      expect(RAZORPAY_PLAN_CONFIG.corporate.period).toBe('monthly');
    });

    it('hobby has no Razorpay plan (hasPaidPlan returns false)', () => {
      expect(hasPaidPlan('hobby')).toBe(false);
    });

    it('professional_plus is a paid plan', () => {
      expect(hasPaidPlan('professional_plus')).toBe(true);
    });

    it('corporate is a paid plan', () => {
      expect(hasPaidPlan('corporate')).toBe(true);
    });

    it('plan config does not include hobby key', () => {
      expect('hobby' in RAZORPAY_PLAN_CONFIG).toBe(false);
    });
  });

});
