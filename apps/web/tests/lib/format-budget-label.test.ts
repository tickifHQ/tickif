import { describe, expect, it } from 'vitest';
import { formatCompactBudgetLabel } from '../../src/lib/format-budget-label';

describe('formatCompactBudgetLabel', () => {
  it.each([
    ['₹5L - ₹15L', '₹5-15L'],
    ['₹15L - ₹35L', '₹15-35L'],
    ['₹5–10L', '₹5-10L'],
  ])('formats %s as %s', (label, expected) => {
    expect(formatCompactBudgetLabel(label)).toBe(expected);
  });

  it.each(['Under ₹5L', '₹35L+'])('leaves non-range label %s unchanged', (label) => {
    expect(formatCompactBudgetLabel(label)).toBe(label);
  });
});
