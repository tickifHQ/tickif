import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Rating } from '../../src/components/reui/rating';

describe('Rating', () => {
  it('renders an accessible decimal rating with a partial star', () => {
    const { container } = render(<Rating rating={3.5} />);

    expect(screen.getByRole('img', { name: '3.5 out of 5 stars' })).toBeInTheDocument();

    const filledStars = container.querySelectorAll('[data-slot="rating-star-filled"]');
    expect(filledStars).toHaveLength(5);
    expect(filledStars[3]?.parentElement).toHaveStyle({ width: '50%' });
    expect(filledStars[4]?.parentElement).toHaveStyle({ width: '0%' });
  });
});
