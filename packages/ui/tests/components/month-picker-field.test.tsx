import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MonthPickerField } from '../../src/components/month-picker-field';

describe('MonthPickerField', () => {
  it('renders the existing YYYY-MM value', () => {
    render(<MonthPickerField label="Project completed by" value="2026-03" onChange={vi.fn()} />);

    expect(screen.getByDisplayValue('2026-03')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-03')).toHaveAttribute('type', 'month');
  });

  it('emits a YYYY-MM value when a month is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<MonthPickerField label="Project completed by" value="2026-03" onChange={onChange} />);

    await user.click(screen.getByDisplayValue('2026-03'));
    await user.click(screen.getByRole('button', { name: 'Apr' }));

    expect(onChange).toHaveBeenCalledWith('2026-04');
  });

  it('can clear an existing value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<MonthPickerField label="Project completed by" value="2026-03" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Clear Project completed by' }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('syncs the visible year from a new value when opened', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MonthPickerField label="Project completed by" value="" onChange={vi.fn()} />,
    );

    rerender(<MonthPickerField label="Project completed by" value="2030-03" onChange={vi.fn()} />);
    await user.click(screen.getByDisplayValue('2030-03'));

    expect(screen.getByText('2030')).toBeInTheDocument();
  });

  it('closes the picker with Escape', async () => {
    const user = userEvent.setup();

    render(<MonthPickerField label="Project completed by" value="2026-03" onChange={vi.fn()} />);

    await user.click(screen.getByDisplayValue('2026-03'));
    expect(screen.getByRole('dialog', { name: 'Project completed by month picker' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Project completed by month picker' })).not.toBeInTheDocument();
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

  it('renders the picker as an overlay so parent containers do not clip it', async () => {
    const user = userEvent.setup();

    render(<MonthPickerField label="Project completed by" value="2026-03" onChange={vi.fn()} />);

    await user.click(screen.getByDisplayValue('2026-03'));

    expect(screen.getByRole('button', { name: 'Apr' }).closest('.fixed')).toBeInTheDocument();
  });
});
