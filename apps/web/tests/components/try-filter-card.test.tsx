import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TryFilterCard } from '../../src/components/try-filter-card';

describe('TryFilterCard', () => {
  it('matches the filter suggestion treatment with the shared lightbulb icon', () => {
    const { container } = render(
      <TryFilterCard
        suggestions={[
          { href: '/?budgetBand=3l-5l', label: '₹3L - ₹5L' },
          { href: '/?budgetBand=5l-10l', label: '₹5L - ₹10L' },
        ]}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'Try a filter' });
    const card = heading.parentElement;

    expect(card).toHaveClass('bg-surface-subtle', 'rounded-xl', 'px-[22px]', 'py-[26px]');
    expect(heading.querySelector('svg')).toBeInTheDocument();
    expect(heading).not.toHaveTextContent('💡');
    expect(
      screen.getByText('These came up for explorers with your budget but a different style.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '₹3-5L' })).toHaveAttribute(
      'href',
      '/?budgetBand=3l-5l',
    );
    expect(screen.queryByText('₹3L - ₹5L')).not.toBeInTheDocument();
    expect(container.querySelectorAll('a')).toHaveLength(2);
  });
});
