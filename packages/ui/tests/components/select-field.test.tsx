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

  it('associates a validation error with the select', () => {
    render(
      <SelectField
        id="status"
        error="Choose a valid status."
        label="Status"
        value="new"
        onValueChange={vi.fn()}
        placeholder="Select status"
        options={[{ label: 'New', value: 'new' }]}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Status' });
    const error = screen.getByText('Choose a valid status.');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAttribute('aria-describedby', error.id);
  });

  it('supports control-level styling without moving styles to the field wrapper', () => {
    render(
      <SelectField
        className="field-wrapper"
        selectClassName="h-8"
        label="Role"
        value="designer"
        onValueChange={vi.fn()}
        placeholder="Select role"
        options={[{ label: 'Designer', value: 'designer' }]}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Role' });
    expect(select).toHaveClass('h-8');
    expect(select.parentElement?.parentElement).toHaveClass('field-wrapper');
  });
});
