import { describe, expect, it } from 'vitest';
import { DEFAULT_PORTFOLIO_ACCENT } from '@repo/contracts';
import { designerPortfolio } from '../src/schema/domain.js';

describe('portfolio defaults', () => {
  it('uses Tickif green for new portfolios', () => {
    expect(DEFAULT_PORTFOLIO_ACCENT).toBe('#1E7A55');
    expect(designerPortfolio.accentColor.default).toBe(DEFAULT_PORTFOLIO_ACCENT);
  });
});
