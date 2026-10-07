import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ModeToggle } from '../../src/components/mode-toggle';

const setTheme = vi.hoisted(() => vi.fn());
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme }),
}));

describe('ModeToggle', () => {
  it('changes appearance without submitting a surrounding form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <ModeToggle />
      </form>,
    );
    await user.click(screen.getByRole('button', { name: 'Toggle dark mode' }));
    expect(setTheme).toHaveBeenCalledWith('dark');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
