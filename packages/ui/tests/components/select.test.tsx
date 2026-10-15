import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Select, SelectTrigger } from '../../src/components/select';

describe('SelectTrigger', () => {
  it('opts into the measured city pill while keeping default fields unchanged', () => {
    const view = render(
      <Select>
        <SelectTrigger variant="navigation" aria-label="City">
          Chennai
        </SelectTrigger>
      </Select>,
    );
    const city = screen.getByRole('combobox', { name: 'City' });
    expect(city).toHaveClass(
      'h-8',
      'w-auto',
      'rounded-full',
      'border-0',
      'bg-card',
      'px-2.5',
      'gap-1.5',
      'leading-[18px]',
    );
    expect(city.querySelector('svg')).toHaveClass('size-3');
    expect(city).not.toHaveAttribute('variant');
    view.rerender(
      <Select>
        <SelectTrigger aria-label="City">Chennai</SelectTrigger>
      </Select>,
    );
    expect(city).toHaveClass('h-11', 'border-input', 'bg-background');
    expect(city).not.toHaveClass('h-8', 'border-0');
    expect(city.querySelector('svg')).toHaveClass('size-4');
  });
});
