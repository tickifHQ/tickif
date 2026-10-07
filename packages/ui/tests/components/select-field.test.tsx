import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SelectField } from '../../src/components/select-field';

const options = [
  { label: 'New', value: 'new' },
  { label: 'Archived', value: 'archived' },
];

describe('SelectField', () => {
  it('opens a custom list without an empty choice by default', async () => {
    const user = userEvent.setup();
    render(
      <SelectField
        label="Status"
        value="new"
        onValueChange={vi.fn()}
        placeholder="Select status"
        options={options}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Status' });
    expect(trigger.tagName).toBe('BUTTON');
    await user.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Select status' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'New' })).toHaveAttribute('aria-selected', 'true');
  });

  it('clears to the public empty-string value when allowEmpty is set', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SelectField
        allowEmpty
        label="Status"
        value="new"
        onValueChange={onValueChange}
        placeholder="All statuses"
        options={options}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'All statuses' }));
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('emits the selected option value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SelectField
        label="Status"
        value="new"
        onValueChange={onValueChange}
        placeholder="Select status"
        options={options}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'Archived' }));
    expect(onValueChange).toHaveBeenCalledWith('archived');
  });

  it('associates existing descriptions and validation errors with the trigger', () => {
    render(
      <>
        <p id="status-help">Current workflow state.</p>
        <SelectField
          id="status"
          aria-describedby="status-help"
          error="Choose a valid status."
          label="Status"
          value="new"
          onValueChange={vi.fn()}
          placeholder="Select status"
          options={options}
        />
      </>,
    );
    const select = screen.getByRole('combobox', { name: 'Status' });
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAttribute(
      'aria-describedby',
      `status-help ${screen.getByText('Choose a valid status.').id}`,
    );
  });

  it('does not open a disabled control', async () => {
    const user = userEvent.setup();
    render(
      <SelectField
        disabled
        label="Status"
        value="new"
        onValueChange={vi.fn()}
        placeholder="Select status"
        options={options}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('marks an unavailable option as disabled', async () => {
    const user = userEvent.setup();
    render(
      <SelectField
        label="Status"
        value="new"
        onValueChange={vi.fn()}
        placeholder="Select status"
        options={[options[0]!, { label: 'Archived', value: 'archived', disabled: true }]}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    expect(screen.getByRole('option', { name: 'Archived' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('submits the controlled value, including clearing, without exposing the internal item token', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    function FormExample() {
      const [value, setValue] = useState('new');
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget).get('status'));
          }}
        >
          <SelectField
            name="status"
            allowEmpty
            label="Status"
            value={value}
            onValueChange={setValue}
            placeholder="All statuses"
            options={options}
          />
          <button type="submit">Submit</button>
        </form>
      );
    }
    render(<FormExample />);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(submit).toHaveBeenLastCalledWith('new');
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'Archived' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(submit).toHaveBeenLastCalledWith('archived');
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'All statuses' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(submit).toHaveBeenLastCalledWith('');
  });
});
