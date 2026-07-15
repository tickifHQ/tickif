import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TagCombobox } from '../../src/components/tag-combobox';

const options = [
  { label: 'Accent wall', value: 'accent-wall' },
  { label: 'Marble counter', value: 'marble-counter' },
  { label: 'Window seating', value: 'window-seating' },
];

describe('TagCombobox', () => {
  it('shows autocomplete suggestions on focus', async () => {
    const user = userEvent.setup();
    render(
      <TagCombobox
        tags={[]}
        value=""
        onValueChange={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
        options={options}
      />,
    );

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByRole('option', { name: 'Accent wall' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Marble counter' })).toBeInTheDocument();
  });

  it('adds the active matching option with Enter', async () => {
    const user = userEvent.setup();
    const onAddTag = vi.fn();
    const onValueChange = vi.fn();

    render(
      <TagCombobox
        tags={[]}
        value="mar"
        onValueChange={onValueChange}
        onAddTag={onAddTag}
        onRemoveTag={vi.fn()}
        options={options}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{Enter}');

    expect(onAddTag).toHaveBeenCalledWith('Marble counter');
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('does not add the first suggestion on bare Enter after focus', async () => {
    const user = userEvent.setup();
    const onAddTag = vi.fn();

    render(
      <TagCombobox
        tags={[]}
        value=""
        onValueChange={vi.fn()}
        onAddTag={onAddTag}
        onRemoveTag={vi.fn()}
        options={options}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{Enter}');

    expect(onAddTag).not.toHaveBeenCalled();
  });

  it('allows creating a tag when no option matches', async () => {
    const user = userEvent.setup();
    const onAddTag = vi.fn();

    render(
      <TagCombobox
        tags={[]}
        value="Skylight"
        onValueChange={vi.fn()}
        onAddTag={onAddTag}
        onRemoveTag={vi.fn()}
        options={options}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{Enter}');

    expect(onAddTag).toHaveBeenCalledWith('Skylight');
  });

  it('blocks case-variant duplicate tags', async () => {
    const user = userEvent.setup();
    const onAddTag = vi.fn();
    const onValueChange = vi.fn();

    render(
      <TagCombobox
        tags={['Accent wall']}
        value="accent wall"
        onValueChange={onValueChange}
        onAddTag={onAddTag}
        onRemoveTag={vi.fn()}
        options={options}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{Enter}');

    expect(onAddTag).not.toHaveBeenCalled();
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('keeps keyboard navigation aligned with the active option', async () => {
    const user = userEvent.setup();

    render(
      <TagCombobox
        tags={[]}
        value=""
        onValueChange={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
        options={[
          ...options,
          { label: 'Warm lighting', value: 'warm-lighting' },
          { label: 'Wood paneling', value: 'wood-paneling' },
        ]}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');

    expect(screen.getByRole('option', { name: 'Wood paneling' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('renders suggestions in an overlay so surrounding layout does not reflow', async () => {
    const user = userEvent.setup();

    render(
      <TagCombobox
        tags={[]}
        value=""
        onValueChange={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
        options={options}
      />,
    );

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByRole('listbox')).toHaveClass('fixed');
  });
});
