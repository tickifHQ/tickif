import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingDots } from '../../src/components/loading-dots';

describe('LoadingDots', () => {
  it('renders decorative Lucide dots with semantic color and no motion requirement', () => {
    const { container } = render(<LoadingDots />);
    const group = container.querySelector('span');
    expect(group).toHaveAttribute('aria-hidden', 'true');
    expect(group).toHaveClass('gap-1.5', 'text-primary');
    const dots = container.querySelectorAll('svg.lucide-circle');
    expect(dots).toHaveLength(3);
    for (const dot of dots) expect(dot).toHaveClass('size-2', 'fill-current');
    expect(dots[1]).toHaveClass('opacity-60');
    expect(dots[2]).toHaveClass('opacity-30');
  });
});
