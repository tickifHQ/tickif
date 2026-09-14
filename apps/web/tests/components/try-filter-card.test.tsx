import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TryFilterCard } from '../../src/components/try-filter-card';

describe('TryFilterCard', () => {
  it('matches the filter suggestion treatment with the shared lightbulb icon', () => {
    const { container } = render(
      <TryFilterCard
        suggestions={[
          {
            href: '/?budgetBand=3l-5l',
            label: '₹3L - ₹5L',
            facet: 'budgetBand',
            facetLabel: 'Budget',
            resultCount: 4,
          },
          {
            href: '/?theme=modern',
            label: 'Modern',
            facet: 'theme',
            facetLabel: 'Theme',
            resultCount: 8,
          },
        ]}
        hasActiveCriteria
      />,
    );

    const heading = screen.getByRole('heading', { name: 'Try a filter' });
    const card = heading.parentElement;

    expect(card).toHaveClass('bg-surface-subtle', 'rounded-xl', 'px-[22px]', 'py-[26px]');
    expect(heading.querySelector('svg')).toBeInTheDocument();
    expect(heading).not.toHaveTextContent('💡');
    expect(
      screen.getByText('Keep your current search and filters, then try another available option.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '₹3–5L, Budget filter, 4 projects' })).toHaveAttribute(
      'href',
      '/?budgetBand=3l-5l',
    );
    expect(screen.getByRole('link', { name: 'Modern, Theme filter, 8 projects' })).toHaveAttribute(
      'href',
      '/?theme=modern',
    );
    expect(screen.queryByText('₹3L - ₹5L')).not.toBeInTheDocument();
    expect(container.querySelectorAll('a')).toHaveLength(2);
  });
});
