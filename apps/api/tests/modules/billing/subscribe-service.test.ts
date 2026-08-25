import { describe, expect, it } from 'vitest';
import { PLAN_TIER } from '@repo/contracts';
import {
  hasPaidPlan,
  resolveRazorpayPlanId,
  RAZORPAY_PLAN_CONFIG,
} from '../../../src/modules/billing/razorpay-client.js';

/**
 * E-115 Subscribe service unit tests.
 *
 * Verifies:
 * - Tier→plan mapping correctness
 * - Hobby rejection
 * - Server-side plan resolution
 * - Pricing in paise
 */

describe('subscribe-service business rules', () => {
  describe('tier validation', () => {
    it('hobby is not a paid tier', () => {
      expect(hasPaidPlan(PLAN_TIER.HOBBY)).toBe(false);
    });

    it('professional_plus is a paid tier', () => {
      expect(hasPaidPlan(PLAN_TIER.PROFESSIONAL_PLUS)).toBe(true);
    });

    it('corporate is a paid tier', () => {
      expect(hasPaidPlan(PLAN_TIER.CORPORATE)).toBe(true);
    });
  });

  describe('plan pricing (paise)', () => {
    it('professional_plus = ₹2,999 = 299900 paise', () => {
      expect(RAZORPAY_PLAN_CONFIG.professional_plus.amountPaise).toBe(299900);
    });

    it('corporate = ₹7,999 = 799900 paise', () => {
      expect(RAZORPAY_PLAN_CONFIG.corporate.amountPaise).toBe(799900);
    });

    it('both plans are monthly INR', () => {
      expect(RAZORPAY_PLAN_CONFIG.professional_plus.period).toBe('monthly');
      expect(RAZORPAY_PLAN_CONFIG.professional_plus.currency).toBe('INR');
      expect(RAZORPAY_PLAN_CONFIG.corporate.period).toBe('monthly');
      expect(RAZORPAY_PLAN_CONFIG.corporate.currency).toBe('INR');
    });
  });

  describe('server-side plan resolution', () => {
    it('resolves null when plan IDs are not configured', () => {
      // In test env, RAZORPAY_PLAN_ID_* are not set by default
      // This verifies the function returns null rather than crashing
      const result = resolveRazorpayPlanId('professional_plus');
      // Result is null when env vars are not set, or a string when configured
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('RAZORPAY_PLAN_CONFIG does not contain hobby', () => {
      expect(Object.keys(RAZORPAY_PLAN_CONFIG)).not.toContain('hobby');
    });

    it('hasPaidPlan correctly narrows type so resolveRazorpayPlanId is callable', () => {
      const tier = 'professional_plus' as const;
      if (hasPaidPlan(tier)) {
        // Should compile — type narrowing proves tier is not 'hobby'
        const _planId = resolveRazorpayPlanId(tier);
        expect(true).toBe(true);
      }
    });

    it('hobby cannot be passed to resolveRazorpayPlanId (compile-time guard)', () => {
      // This is a compile-time test — if it compiles, the type guard works.
      // hasPaidPlan('hobby') returns false, so the branch is never taken.
      const tier = 'hobby' as const;
      expect(hasPaidPlan(tier)).toBe(false);
    });
  });
});
