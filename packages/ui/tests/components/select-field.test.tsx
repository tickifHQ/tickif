import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SelectField } from '../../src/components/select-field';

describe('SelectField', () => {
  it('renders a disabled placeholder option by default so empty values cannot be selected', () => {
    render(
      <SelectField
        label="Status"
        value="new"
        onValueChange={vi.fn()}
        placeholder="Select status"
        options={[
          { label: 'New', value: 'new' },
          { label: 'Archived', value: 'archived' },
        ]}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Status' });
    const placeholder = select.querySelector('option[value=""]');

    expect(placeholder).toBeDisabled();
    expect(placeholder).toHaveAttribute('hidden');
    expect(placeholder).toHaveTextContent('Select status');
  });

  it('renders a selectable placeholder option when allowEmpty is set so the value can be cleared', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <SelectField
        allowEmpty
        label="Status"
        value="new"
        onValueChange={onValueChange}
        placeholder="Select status"
        options={[
          { label: 'New', value: 'new' },
          { label: 'Archived', value: 'archived' },
        ]}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Status' });
    const placeholder = select.querySelector('option[value=""]');

    expect(placeholder).not.toBeDisabled();
    expect(placeholder).not.toHaveAttribute('hidden');

    await user.selectOptions(select, '');

    expect(onValueChange).toHaveBeenCalledWith('');
  });
});
