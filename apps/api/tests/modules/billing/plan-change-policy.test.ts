import { describe, expect, it } from 'vitest';
import { getPlanChangeTiming } from '../../../src/modules/billing/plan-change-policy.js';

describe('configured tier change timing', () => {
  it.each([
    ['hobby', 'hobby', null],
    ['hobby', 'professional_plus', 'now'],
    ['hobby', 'corporate', 'now'],
    ['professional_plus', 'hobby', 'cycle_end'],
    ['professional_plus', 'professional_plus', null],
    ['professional_plus', 'corporate', 'now'],
    ['corporate', 'hobby', 'cycle_end'],
    ['corporate', 'professional_plus', 'cycle_end'],
    ['corporate', 'corporate', null],
  ] as const)('%s → %s uses %s', (current, target, timing) => {
    expect(getPlanChangeTiming(current, target)).toBe(timing);
  });
});
