import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MonthPickerField } from '../../src/components/month-picker-field';

describe('MonthPickerField', () => {
  it('renders the existing YYYY-MM value', () => {
    render(<MonthPickerField label="Project completed by" value="2026-03" onChange={vi.fn()} />);

    expect(screen.getByDisplayValue('2026-03')).toBeInTheDocument();
  });

  it('emits a YYYY-MM value when a month is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<MonthPickerField label="Project completed by" value="2026-03" onChange={onChange} />);

    await user.click(screen.getByDisplayValue('2026-03'));
    await user.click(screen.getByRole('button', { name: 'Apr' }));

    expect(onChange).toHaveBeenCalledWith('2026-04');
  });

  it('closes the picker when clicking outside the field', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <MonthPickerField label="Project completed by" value="2026-03" onChange={vi.fn()} />
        <button type="button">Outside target</button>
      </div>,
    );

    await user.click(screen.getByDisplayValue('2026-03'));
    expect(screen.getByRole('button', { name: 'Apr' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outside target' }));

    expect(screen.queryByRole('button', { name: 'Apr' })).not.toBeInTheDocument();
  });
});
