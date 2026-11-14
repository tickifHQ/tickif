import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TagCombobox } from '../../src/components/tag-combobox';

const options = [
  { label: 'Accent wall', value: 'accent-wall' },
  { label: 'Marble counter', value: 'marble-counter' },
  { label: 'Window seating', value: 'window-seating' },
];

function Controlled({
  initial = [],
  onChange,
  ...props
}: Omit<ComponentProps<typeof TagCombobox>, 'value' | 'onChange'> & {
  initial?: string[];
  onChange?: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState(initial);
  return (
    <TagCombobox
      {...props}
      value={tags}
      onChange={(next) => {
        setTags(next);
        onChange?.(next);
      }}
    />
  );
}

function chipLabels() {
  return screen
    .queryAllByRole('button', { name: /^Remove / })
    .map((button) => button.getAttribute('aria-label')!.replace(/^Remove /, ''));
}

function liveRegion() {
  return screen.getByRole('status');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('TagCombobox as a plain tag input', () => {
  it('labels the input, describes it with the default hint, and is not a combobox', () => {
    render(<TagCombobox />);

    const input = screen.getByRole('textbox', { name: 'Tags' });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(input).toHaveAccessibleDescription('Enter adds · Backspace removes');
  });

  it('keeps its live region outside the page so modal dialogs can still hide the page', () => {
    const { container } = render(<TagCombobox />);

    expect(container).not.toContainElement(screen.getByRole('status'));
    expect(container.querySelector('[aria-live]')).toBeNull();
  });

  it('uses a visible label when one is given', () => {
    render(<TagCombobox label="Skills" />);

    expect(screen.getByRole('textbox', { name: 'Skills' })).toBeInTheDocument();
  });

  it('commits a trimmed, whitespace-collapsed draft on Enter and ignores empty input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await user.type(input, '   {Enter}');
    expect(onChange).not.toHaveBeenCalled();

    await user.type(input, '  accent    wall {Enter}');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['accent wall']);
    expect(input).toHaveValue('');
    expect(liveRegion()).toHaveTextContent('accent wall added, 1 total.');
  });

  it('commits on the default comma separator as you type', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'teak,oak');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(chipLabels()).toEqual(['teak']);
    expect(input).toHaveValue('oak');
  });

  it('uses configured separators instead of the comma', async () => {
    const user = userEvent.setup();
    render(<Controlled separators={[';']} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'a,b;');

    expect(chipLabels()).toEqual(['a,b']);
    expect(input).toHaveValue('');
  });

  it('splits pasted text on separators, newlines and tabs in one change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    await user.click(screen.getByRole('textbox'));
    await user.paste('teak, oak\nwalnut\tash');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(chipLabels()).toEqual(['teak', 'oak', 'walnut', 'ash']);
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(liveRegion()).toHaveTextContent('4 tags added, 4 total.');
  });

  it('inserts pasted text at the caret so the existing draft is kept', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'wal');
    await user.paste('nut\nash');

    expect(chipLabels()).toEqual(['walnut', 'ash']);
  });

  it('leaves single-word pastes in the draft', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    await user.click(screen.getByRole('textbox'));
    await user.paste('walnut');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('walnut');
  });

  it('highlights the last chip on the first Backspace and removes it on the second', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={['teak', 'oak']} onChange={onChange} />);

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Backspace}');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('oak').closest('li')).toHaveAttribute('data-highlighted', 'true');
    expect(liveRegion()).toHaveTextContent('oak selected, press Backspace again to remove it.');

    await user.keyboard('{Backspace}');

    expect(onChange).toHaveBeenCalledExactlyOnceWith(['teak']);
    expect(liveRegion()).toHaveTextContent('oak removed, 1 left.');
  });

  it('removes the highlighted chip with Delete', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={['teak', 'oak', 'ash']} />);

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{ArrowLeft}{ArrowLeft}{Delete}');

    expect(chipLabels()).toEqual(['teak', 'ash']);
  });

  it('moves the highlight with ArrowLeft at caret 0 and ArrowRight back to the input', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={['teak', 'oak']} />);

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(screen.getByText('teak').closest('li')).toHaveAttribute('data-highlighted', 'true');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('oak').closest('li')).toHaveAttribute('data-highlighted', 'true');

    await user.keyboard('{ArrowRight}');
    expect(document.querySelector('[data-highlighted]')).toBeNull();
  });

  it('does not highlight with ArrowLeft while the caret is inside the draft', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={['teak']} />);

    await user.type(screen.getByRole('textbox'), 'oa');
    await user.keyboard('{ArrowLeft}');

    expect(document.querySelector('[data-highlighted]')).toBeNull();
  });

  it.each([
    ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    ['typing', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('a')],
    ['blur', async (user: ReturnType<typeof userEvent.setup>) => user.tab()],
  ])('clears the highlight on %s', async (_, act) => {
    const user = userEvent.setup();
    render(<Controlled initial={['teak']} />);

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Backspace}');
    expect(document.querySelector('[data-highlighted]')).not.toBeNull();

    await act(user);

    expect(document.querySelector('[data-highlighted]')).toBeNull();
  });

  it('ignores keydown while an IME is composing', () => {
    const onChange = vi.fn();
    render(<Controlled initial={['teak']} onChange={onChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Backspace', isComposing: true });
    fireEvent.change(input, { target: { value: 'にほん' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

    expect(document.querySelector('[data-highlighted]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('にほん');
  });

  it('refuses case-insensitive duplicates, flashes the existing chip and explains why', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();
    render(<Controlled initial={['Teak']} onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'teak{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('teak');
    expect(screen.getByText('Teak').closest('li')).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByText('Teak is already in the list')).toBeInTheDocument();
    expect(liveRegion()).toHaveTextContent('Teak is already in the list.');

    act(() => vi.advanceTimersByTime(2500));

    expect(screen.getByText('Teak').closest('li')).not.toHaveAttribute('data-highlighted');
    expect(screen.queryByText('Teak is already in the list')).not.toBeInTheDocument();
  });

  it('accepts duplicates when allowDuplicates is set', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={['teak']} allowDuplicates />);

    await user.type(screen.getByRole('textbox'), 'teak{Enter}');

    expect(chipLabels()).toEqual(['teak', 'teak']);
  });

  it('stops at max, shows the limit message and a counter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={['teak']} max={2} onChange={onChange} />);

    expect(screen.getByText('/ 2')).toBeInTheDocument();

    await user.click(screen.getByRole('textbox'));
    await user.paste('oak\nash\nelm');

    expect(onChange).toHaveBeenCalledExactlyOnceWith(['teak', 'oak']);
    expect(screen.getByText("That's the limit of 2 tags")).toBeInTheDocument();
    expect(screen.getByText('/ 2').parentElement).toHaveTextContent('2 / 2');
  });

  it('rejects candidates that fail validate', async () => {
    const user = userEvent.setup();
    const validate = vi.fn((tag: string) => tag.length <= 4);
    render(<Controlled initial={['oak']} validate={validate} />);

    await user.type(screen.getByRole('textbox'), 'mahogany{Enter}');

    expect(validate).toHaveBeenCalledWith('mahogany', ['oak']);
    expect(chipLabels()).toEqual(['oak']);
    expect(screen.getByText('mahogany is not allowed here')).toBeInTheDocument();
  });

  it('removes a chip from its labelled button and returns focus to the input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={['teak', 'oak']} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Remove teak' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(['oak']);
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('keeps remove buttons reachable from the keyboard', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={['teak']} />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Remove teak' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(chipLabels()).toEqual([]);
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('manages its own tags when uncontrolled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TagCombobox defaultValue={['teak']} onChange={onChange} />);

    await user.type(screen.getByRole('textbox'), 'oak{Enter}');

    expect(onChange).toHaveBeenCalledWith(['teak', 'oak']);
    expect(chipLabels()).toEqual(['teak', 'oak']);
  });

  it('disables the input and remove buttons', () => {
    render(<TagCombobox defaultValue={['teak']} disabled />);

    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove teak' })).toBeDisabled();
  });
});

describe('TagCombobox with suggestions', () => {
  it('shows autocomplete suggestions on focus', async () => {
    const user = userEvent.setup();
    render(<Controlled options={options} />);

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByRole('option', { name: 'Accent wall' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Marble counter' })).toBeInTheDocument();
  });

  it('adds the active matching option value with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled options={options} onChange={onChange} />);

    await user.type(screen.getByRole('combobox'), 'mar{Enter}');

    expect(onChange).toHaveBeenCalledExactlyOnceWith(['marble-counter']);
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('emits the option value when selecting a suggestion with the pointer', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled options={options} onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Accent wall' }));

    expect(onChange).toHaveBeenCalledWith(['accent-wall']);
  });

  it('resolves separator-committed text that names a suggestion to its value', async () => {
    const user = userEvent.setup();
    render(<Controlled options={options} />);

    await user.type(screen.getByRole('combobox'), 'accent wall,');

    expect(chipLabels()).toEqual(['accent-wall']);
  });

  it('does not add the first suggestion on bare Enter after focus', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled options={options} onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('allows creating a tag when no option matches', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled options={options} onChange={onChange} />);

    await user.type(screen.getByRole('combobox'), 'Skylight');
    expect(screen.getByRole('option', { name: 'Create "Skylight"' })).toBeInTheDocument();
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith(['Skylight']);
  });

  it('hides selected suggestions and refuses case-variant duplicates', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={['accent-wall']} options={options} onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('option', { name: 'Accent wall' })).not.toBeInTheDocument();

    await user.keyboard('ACCENT WALL{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('accent-wall is already in the list')).toBeInTheDocument();
  });

  it('keeps keyboard navigation aligned with the active option', async () => {
    const user = userEvent.setup();
    render(
      <Controlled
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
    render(<Controlled options={options} />);

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByRole('listbox')).toHaveClass('fixed');
  });

  it('reopens the suggestions when typing after Escape closed them', async () => {
    const user = userEvent.setup();
    render(<Controlled options={options} />);

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.keyboard('a');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('keeps the suggestions open when the input is blurred and refocused quickly', async () => {
    const user = userEvent.setup();
    render(<Controlled options={options} />);

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
    let fieldBottom = 40;
    const rectSpy = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function mockRect() {
        return {
          left: 10,
          top: 0,
          right: 210,
          bottom: fieldBottom,
          width: 200,
          height: fieldBottom,
          x: 10,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const { rerender } = render(<TagCombobox value={[]} options={options} />);

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toHaveStyle({ top: '44px' });

    fieldBottom = 80;
    rerender(<TagCombobox value={['Accent wall']} options={options} />);

    expect(screen.getByRole('listbox')).toHaveStyle({ top: '84px' });

    rectSpy.mockRestore();
  });

  it('points aria-activedescendant at the keyboard-highlighted option', async () => {
    const user = userEvent.setup();
    render(<Controlled options={options} />);

    const input = screen.getByRole('combobox');
    await user.click(input);
    expect(input).not.toHaveAttribute('aria-activedescendant');

    await user.keyboard('{ArrowDown}{ArrowDown}');

    const active = screen.getByRole('option', { name: 'Marble counter' });
    expect(active).toHaveAttribute('id');
    expect(input).toHaveAttribute('aria-activedescendant', active.getAttribute('id'));
  });
});
