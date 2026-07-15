import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectField } from '../../src/components/select-field';

describe('SelectField', () => {
  it('renders a disabled placeholder option so empty values cannot be selected', () => {
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
});
