import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToggleGroup, ToggleGroupItem } from '../../src/components/toggle-group';
import { Toggle } from '../../src/components/toggle';

describe('ToggleGroup', () => {
  it('supports a standalone keyboard toggle with pressed semantics', async () => {
    const user = userEvent.setup();
    render(<Toggle>Favourite</Toggle>);
    await user.tab();
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Favourite' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it('exposes single-selection semantics and supports keyboard navigation', async () => {
    const change = vi.fn();
    const user = userEvent.setup();
    render(
      <ToggleGroup type="single" aria-label="Home type" onValueChange={change}>
        <ToggleGroupItem value="one">One</ToggleGroupItem>
        <ToggleGroupItem value="two">Two</ToggleGroupItem>
      </ToggleGroup>,
    );
    await user.tab();
    expect(screen.getByRole('radio', { name: 'One' })).toHaveFocus();
    await user.keyboard('{ArrowRight} ');
    expect(change).toHaveBeenCalledWith('two');
    expect(screen.getByRole('radio', { name: 'Two' })).toHaveAttribute('aria-checked', 'true');
  });
  it('does not select disabled items', async () => {
    const change = vi.fn();
    render(
      <ToggleGroup type="single" disabled onValueChange={change}>
        <ToggleGroupItem value="one">One</ToggleGroupItem>
      </ToggleGroup>,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'One' }));
    expect(change).not.toHaveBeenCalled();
  });
});
