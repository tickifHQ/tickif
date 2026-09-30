import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApartmentNameCombobox } from '../../src/components/apartment-name-combobox';

function ApartmentField() {
  const [value, setValue] = useState('');
  return (
    <>
      <ApartmentNameCombobox
        id="apartment"
        label="Apartment"
        placeholder="Apartment name"
        value={value}
        onChange={setValue}
      />
      <button type="button">Next field</button>
    </>
  );
}

describe('ApartmentNameCombobox', () => {
  it('preserves the selected apartment when reopening and confirming with Enter', async () => {
    const user = userEvent.setup();
    render(<ApartmentField />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.click(screen.getByRole('option', { name: /Prestige Lakeside/i }));

    await user.click(input);
    await user.keyboard('{Enter}');

    expect(input).toHaveValue('Prestige Lakeside');
  });

  it('opens at the first option when ArrowDown reopens an empty field', async () => {
    const user = userEvent.setup();
    render(<ApartmentField />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{Escape}{ArrowDown}{Enter}');

    expect(input).toHaveValue('Casagrand First City');
  });

  it('reopens a selected apartment without requiring the user to blur the field', async () => {
    const user = userEvent.setup();
    render(<ApartmentField />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.click(screen.getByRole('option', { name: /Prestige Lakeside/i }));
    expect(input).toHaveValue('Prestige Lakeside');
    expect(screen.queryByRole('listbox')).toBeNull();

    await user.click(input);

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('moves Tab to the next field without tabbing through the list options', async () => {
    const user = userEvent.setup();
    render(<ApartmentField />);
    await user.click(screen.getByRole('combobox'));

    await user.tab();

    expect(screen.getByRole('button', { name: 'Next field' })).toHaveFocus();
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
