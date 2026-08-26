import { describe, expect, it } from 'vitest';
import { buildBillingState, isValidBillingCombination } from '../../src/lib/billing-fixtures';

describe('isValidBillingCombination', () => {
  it('allows Hobby only as active or downgraded', () => {
    expect(isValidBillingCombination('hobby', 'active')).toBe(true);
    expect(isValidBillingCombination('hobby', 'downgraded', 'corporate')).toBe(true);
    expect(isValidBillingCombination('hobby', 'locked')).toBe(false);
    expect(isValidBillingCombination('hobby', 'grace')).toBe(false);
  });

  it('rejects paid × downgraded', () => {
    expect(isValidBillingCombination('corporate', 'downgraded', 'corporate')).toBe(false);
    expect(isValidBillingCombination('professional_plus', 'downgraded', 'professional_plus')).toBe(
      false,
    );
  });

  it('rejects downgraded without a paid pre-lapse tier', () => {
    expect(isValidBillingCombination('hobby', 'downgraded')).toBe(false);
    expect(isValidBillingCombination('hobby', 'downgraded', 'hobby')).toBe(false);
  });
});

describe('buildBillingState', () => {
  it('throws on illegal combinations', () => {
    expect(() => buildBillingState('corporate', 'downgraded', 'corporate')).toThrow(
      /Invalid billing combination/,
    );
  });

  it('builds Hobby + preLapseTier for downgraded', () => {
    const state = buildBillingState('hobby', 'downgraded', 'corporate');
    expect(state.tier).toBe('hobby');
    expect(state.preLapseTier).toBe('corporate');
    expect(state.billing).toBeNull();
  });
});
