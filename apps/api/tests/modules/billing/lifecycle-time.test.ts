import { describe, expect, it } from 'vitest';
import { daysRemaining } from '../../../src/modules/billing/lifecycle-time.js';

describe('daysRemaining', () => {
  it('rounds a partial day up and reaches zero at the sweep deadline', () => {
    const startedAt = new Date('2026-09-01T00:00:00.000Z');
    const deadline = new Date('2026-09-08T00:00:00.000Z');

    expect(daysRemaining(startedAt, 7, new Date(deadline.getTime() - 1))).toBe(1);
    expect(daysRemaining(startedAt, 7, deadline)).toBe(0);
    expect(daysRemaining(startedAt, 7, new Date(deadline.getTime() + 1))).toBe(0);
    expect(daysRemaining(null, 7, deadline)).toBeNull();
  });
});
