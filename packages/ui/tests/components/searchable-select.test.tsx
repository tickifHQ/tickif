import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SearchableSelect } from '../../src/components/searchable-select';

const options = [
  { value: 'first', label: 'First person' },
  { value: 'second', label: 'Second person' },
];

function Example() {
  const [value, setValue] = useState('');
  const [query, setQuery] = useState('');
  return (
    <SearchableSelect
      label="Teammate"
      placeholder="Search teammates"
      value={value}
      onValueChange={setValue}
      onSearchChange={setQuery}
      options={options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))}
    />
  );
}

describe('SearchableSelect', () => {
  it('searches and selects with the keyboard in one labelled combobox', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const input = screen.getByRole('combobox', { name: 'Teammate' });
    await user.click(input);
    await user.type(input, 'second');
    expect(screen.queryByRole('option', { name: 'First person' })).not.toBeInTheDocument();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(input).toHaveValue('Second person');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.clear(input);
    expect(input).toHaveValue('');
  });

  it('keeps server-provided options available and requests more from inside the menu', async () => {
    const user = userEvent.setup();
    const search = vi.fn();
    const more = vi.fn();
    render(
      <SearchableSelect
        label="Teammate"
        placeholder="Search teammates"
        value=""
        onValueChange={vi.fn()}
        onSearchChange={search}
        options={options}
        hasMore
        onLoadMore={more}
      />,
    );
    const input = screen.getByRole('combobox', { name: 'Teammate' });
    await user.click(input);
    await user.type(input, 'server-search');
    expect(search).toHaveBeenLastCalledWith('server-search');
    expect(screen.getByRole('option', { name: 'First person' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more options' }));
    expect(more).toHaveBeenCalledOnce();
  });

  it('clears displayed selection when the parent resets the value', () => {
    const props = {
      label: 'Teammate',
      placeholder: 'Search teammates',
      onValueChange: vi.fn(),
      onSearchChange: vi.fn(),
      options,
    };
    const { rerender } = render(<SearchableSelect {...props} value="first" />);
    expect(screen.getByRole('combobox', { name: 'Teammate' })).toHaveValue('First person');
    rerender(<SearchableSelect {...props} value="" />);
    expect(screen.getByRole('combobox', { name: 'Teammate' })).toHaveValue('');
  });

  it('shows recoverable loading errors and blocks unavailable options', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const more = vi.fn();
    const props = {
      label: 'Teammate',
      placeholder: 'Search teammates',
      value: '',
      onValueChange: vi.fn(),
      onSearchChange: vi.fn(),
      options,
      hasMore: true,
      onLoadMore: more,
    };
    const { rerender } = render(<SearchableSelect {...props} isLoading />);
    await user.click(screen.getByRole('combobox', { name: 'Teammate' }));
    expect(screen.getByRole('option', { name: 'First person' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    rerender(<SearchableSelect {...props} error="Could not load teammates." onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load teammates.');
    expect(screen.getByRole('button', { name: 'Load more options' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry loading options' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
