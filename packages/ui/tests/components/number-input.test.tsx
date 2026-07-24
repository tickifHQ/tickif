import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NumberInput } from '../../src/components/number-input';

describe('NumberInput', () => {
  it('replaces native browser spin buttons with the shared chevrons icon', () => {
    const { container } = render(<NumberInput aria-label="Project size" />);

    const input = screen.getByRole('spinbutton', { name: 'Project size' });

    expect(input).toHaveClass('[appearance:textfield]');
    expect(input).toHaveClass('[&::-webkit-inner-spin-button]:appearance-none');
    expect(input).toHaveClass('[&::-webkit-outer-spin-button]:appearance-none');
    expect(container.querySelector('[data-slot="number-input-icon"]')).toBeInTheDocument();
  });
});
