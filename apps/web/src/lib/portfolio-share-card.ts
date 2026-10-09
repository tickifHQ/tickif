import type { PublicPortfolioResponse } from '@repo/contracts';
import { formatCompactBudgetLabel } from '@/lib/format-budget-label';
import { formatRating } from '@/lib/public-portfolio-view';

/** The on-page card and its social image must show the same facts and visibility. */
export function portfolioShareFacts(portfolio: PublicPortfolioResponse) {
  const rating = portfolio.sections.overallRating
    ? [portfolio.stats.tickif, portfolio.stats.google].find(
        (source) => source && source.reviewCount > 0,
      )
    : null;
  return [
    rating ? { label: 'Rating', value: formatRating(rating.rating) } : null,
    { label: 'Projects', value: String(portfolio.stats.projectCount) },
    portfolio.foundedYear != null
      ? { label: 'Established', value: String(portfolio.foundedYear) }
      : null,
    portfolio.stats.startingBudget
      ? { label: 'Starting at', value: formatCompactBudgetLabel(portfolio.stats.startingBudget) }
      : null,
  ].filter((fact): fact is NonNullable<typeof fact> => fact !== null);
}
