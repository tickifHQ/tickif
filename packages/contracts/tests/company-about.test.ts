import { describe, expect, it } from 'vitest';
import { portfolioCompanyAboutSchema, updatePortfolioSchema } from '../src/profiles';

describe('company about information', () => {
  it('keeps company copy separate from client testimonials', () => {
    const result = updatePortfolioSchema.parse({
      aboutCompany: { headline: ' Our studio ', story: 'Our company story.' },
    });
    expect(result.aboutCompany).toMatchObject({
      headline: 'Our studio',
      story: 'Our company story.',
      founderName: '',
    });
    expect(result).not.toHaveProperty('testimonialWords');
  });
  it('enforces the design limits for headline and story', () => {
    expect(portfolioCompanyAboutSchema.safeParse({ headline: 'a'.repeat(81) }).success).toBe(false);
    expect(portfolioCompanyAboutSchema.safeParse({ story: 'a'.repeat(451) }).success).toBe(false);
  });
});
