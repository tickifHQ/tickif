import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TagCombobox } from '../../src/components/tag-combobox';

const options = [
  { label: 'Accent wall', value: 'accent-wall' },
  { label: 'Marble counter', value: 'marble-counter' },
  { label: 'Window seating', value: 'window-seating' },
];

function ControlledTagCombobox() {
  const [tags, setTags] = useState<string[]>([]);
  const [value, setValue] = useState('');

  return (
    <TagCombobox
      tags={tags}
      value={value}
      onValueChange={setValue}
      onAddTag={(tag) => setTags((current) => [...current, tag])}
      onRemoveTag={(tag) => setTags((current) => current.filter((existing) => existing !== tag))}
      options={options}
    />
  );
}

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

    expect(onAddTag).toHaveBeenCalledWith('marble-counter');
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('emits the option value when selecting a suggestion with the pointer', async () => {
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
    await user.click(screen.getByRole('option', { name: 'Accent wall' }));

    expect(onAddTag).toHaveBeenCalledWith('accent-wall');
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

  it('reopens the suggestions when typing after Escape closed them', async () => {
    const user = userEvent.setup();

    render(<ControlledTagCombobox />);

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.keyboard('a');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('keeps the suggestions open when the input is blurred and refocused quickly', async () => {
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

    const input = screen.getByRole('combobox');
    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.blur(input);
    fireEvent.focus(input);
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('repositions the open listbox when a tag is added', async () => {
    const user = userEvent.setup();
    let containerBottom = 40;
    const rectSpy = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function mockRect() {
        return {
          left: 10,
          top: 0,
          right: 210,
          bottom: containerBottom,
          width: 200,
          height: containerBottom,
          x: 10,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const sharedProps = {
      value: '',
      onValueChange: vi.fn(),
      onAddTag: vi.fn(),
      onRemoveTag: vi.fn(),
      options,
    };

    const { rerender } = render(<TagCombobox tags={[]} {...sharedProps} />);

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toHaveStyle({ top: '44px' });

    containerBottom = 80;
    rerender(<TagCombobox tags={['Accent wall']} {...sharedProps} />);

    expect(screen.getByRole('listbox')).toHaveStyle({ top: '84px' });

    rectSpy.mockRestore();
  });

  it('points aria-activedescendant at the keyboard-highlighted option', async () => {
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

    const input = screen.getByRole('combobox');
    await user.click(input);
    expect(input).not.toHaveAttribute('aria-activedescendant');

    await user.keyboard('{ArrowDown}{ArrowDown}');

    const active = screen.getByRole('option', { name: 'Marble counter' });
    expect(active).toHaveAttribute('id');
    expect(input).toHaveAttribute('aria-activedescendant', active.getAttribute('id'));
  });
});
