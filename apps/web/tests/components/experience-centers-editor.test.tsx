import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ExperienceCenter } from '@repo/contracts';
import {
  ExperienceCentersEditor,
  groupExperienceCentersByState,
} from '../../src/components/experience-centers-editor';

const whitefield: ExperienceCenter = {
  name: 'Whitefield Experience Center',
  address: '12, 1st Main Road, Whitefield',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560066',
  phone: '9994645911',
  mapsUrl: null,
};

const powai: ExperienceCenter = {
  name: 'Powai Studio',
  address: '4, Hiranandani Gardens, Powai',
  city: 'Mumbai',
  state: 'Maharashtra',
  postalCode: null,
  phone: null,
  mapsUrl: null,
};

const bandra: ExperienceCenter = {
  name: 'Bandra Lounge',
  address: '9, Linking Road, Bandra West',
  city: 'Mumbai',
  state: 'Maharashtra',
  postalCode: null,
  phone: null,
  mapsUrl: null,
};

describe('groupExperienceCentersByState', () => {
  it('groups centers under their state, alphabetically, preserving insertion order within a state', () => {
    const grouped = groupExperienceCentersByState([powai, whitefield, bandra]);
    expect(grouped.map((g) => g.state)).toEqual(['Karnataka', 'Maharashtra']);
    const maharashtra = grouped.find((g) => g.state === 'Maharashtra');
    expect(maharashtra?.centers.map((c) => c.name)).toEqual(['Powai Studio', 'Bandra Lounge']);
  });

  it('returns an empty grouping for no centers', () => {
    expect(groupExperienceCentersByState([])).toEqual([]);
  });
});

describe('ExperienceCentersEditor', () => {
  it('keeps editing the same center after removing an earlier center', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ExperienceCentersEditor value={[whitefield, powai, bandra]} onChange={onChange} />,
    );
    await user.click(screen.getByRole('button', { name: 'Edit Powai Studio' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Updated Powai');
    await user.click(screen.getByRole('button', { name: 'Remove Whitefield Experience Center' }));
    rerender(<ExperienceCentersEditor value={[powai, bandra]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Save center' }));
    expect(onChange).toHaveBeenLastCalledWith([{ ...powai, name: 'Updated Powai' }, bandra]);
  });

  it('disables adding centers at the portfolio contract limit', () => {
    const centers = Array.from({ length: 20 }, (_, index) => ({
      ...whitefield,
      name: `Center ${index}`,
    }));
    render(<ExperienceCentersEditor value={centers} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add experience center/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Center 0' })).toBeEnabled();
  });

  it('displays and preserves a saved free-text state outside the dropdown list', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const center = { ...whitefield, state: 'NCT of Delhi' };
    render(<ExperienceCentersEditor value={[center]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Edit Whitefield Experience Center' }));
    expect(screen.getByLabelText('State')).toHaveValue('NCT of Delhi');
    await user.click(screen.getByRole('button', { name: 'Save center' }));
    expect(onChange).toHaveBeenCalledWith([center]);
  });

  it('shows the empty state when there are no experience centers', () => {
    render(<ExperienceCentersEditor value={[]} onChange={vi.fn()} />);

    expect(screen.getByTestId('experience-centers-empty')).toBeInTheDocument();
    expect(screen.getByText('No experience centers yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add experience center/i })).toBeInTheDocument();
  });

  it('loads and displays existing centers grouped by state', () => {
    render(<ExperienceCentersEditor value={[whitefield, powai, bandra]} onChange={vi.fn()} />);

    const stateHeadings = screen
      .getAllByRole('heading', { level: 4 })
      .map((node) => node.textContent);
    expect(stateHeadings).toEqual(['Karnataka', 'Maharashtra']);

    // Maharashtra group lists both Mumbai centers under one state heading.
    const groups = screen
      .getAllByRole('listitem')
      .filter((li) => within(li).queryByText('Maharashtra'));
    expect(screen.getByText('Whitefield Experience Center')).toBeInTheDocument();
    expect(screen.getByText('Powai Studio')).toBeInTheDocument();
    expect(screen.getByText('Bandra Lounge')).toBeInTheDocument();
    expect(groups.length).toBe(1);
    expect(screen.queryByTestId('experience-centers-empty')).not.toBeInTheDocument();
  });

  it('adds a new experience center through the form and emits the full array', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExperienceCentersEditor value={[whitefield]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /add experience center/i }));
    await user.type(screen.getByLabelText('Name'), 'Powai Studio');
    await user.type(screen.getByLabelText('Address'), '4, Hiranandani Gardens, Powai');
    await user.type(screen.getByLabelText('City'), 'Mumbai');
    await user.selectOptions(screen.getByLabelText('State'), 'Maharashtra');
    await user.click(screen.getByRole('button', { name: 'Add center' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([
        whitefield,
        {
          name: 'Powai Studio',
          address: '4, Hiranandani Gardens, Powai',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: null,
          phone: null,
          mapsUrl: null,
        },
      ]);
    });
  });

  it('renders the State field as a dropdown with all 36 States and Union Territories', async () => {
    const user = userEvent.setup();
    render(<ExperienceCentersEditor value={[]} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /add experience center/i }));

    const stateField = screen.getByLabelText('State');
    expect(stateField.tagName).toBe('SELECT');
    // 36 selectable States/UTs (the disabled "Select a state" placeholder is
    // hidden and excluded from the option role).
    const optionLabels = within(stateField)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionLabels).toHaveLength(36);
    for (const expected of [
      'Andhra Pradesh',
      'Karnataka',
      'Maharashtra',
      'West Bengal',
      'Andaman and Nicobar Islands',
      'Dadra and Nagar Haveli and Daman and Diu',
      'Delhi',
      'Puducherry',
    ]) {
      expect(optionLabels).toContain(expected);
    }
  });

  it('selecting a state updates the form value and saves it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExperienceCentersEditor value={[]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /add experience center/i }));
    await user.type(screen.getByLabelText('Name'), 'Kochi Center');
    await user.type(screen.getByLabelText('Address'), '5 Marine Drive');
    await user.type(screen.getByLabelText('City'), 'Kochi');
    const stateField = screen.getByLabelText('State');
    await user.selectOptions(stateField, 'Kerala');
    expect((stateField as HTMLSelectElement).value).toBe('Kerala');
    await user.click(screen.getByRole('button', { name: 'Add center' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'Kochi Center', state: 'Kerala' }),
      ]);
    });
  });

  it('preselects the saved state in the dropdown when editing', async () => {
    const user = userEvent.setup();
    render(<ExperienceCentersEditor value={[whitefield]} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /edit whitefield experience center/i }));

    expect((screen.getByLabelText('State') as HTMLSelectElement).value).toBe('Karnataka');
  });

  it('flags the required State field when left unselected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExperienceCentersEditor value={[]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /add experience center/i }));
    await user.type(screen.getByLabelText('Name'), 'No State Center');
    await user.type(screen.getByLabelText('Address'), '1 Test Road');
    await user.type(screen.getByLabelText('City'), 'Bengaluru');
    // State intentionally left unselected.
    await user.click(screen.getByRole('button', { name: 'Add center' }));

    expect(screen.getByLabelText('State')).toHaveAttribute('aria-invalid', 'true');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('edits an existing center and emits the updated array', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExperienceCentersEditor value={[whitefield]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /edit whitefield experience center/i }));
    const nameField = screen.getByLabelText('Name');
    await user.clear(nameField);
    await user.type(nameField, 'Whitefield Flagship');
    await user.click(screen.getByRole('button', { name: 'Save center' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([{ ...whitefield, name: 'Whitefield Flagship' }]);
    });
  });

  it('replaces the edited center card with the edit form in the same state group', async () => {
    const user = userEvent.setup();
    render(<ExperienceCentersEditor value={[whitefield, powai, bandra]} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Edit Powai Studio' }));

    expect(screen.queryByRole('button', { name: 'Edit Powai Studio' })).not.toBeInTheDocument();
    expect(screen.queryByText('Powai Studio')).not.toBeInTheDocument();

    const form = screen
      .getByText('Edit experience center')
      .closest('[data-slot="experience-center-form"]');
    const editedItem = form?.closest('[data-slot="experience-center-item"]');
    const maharashtraHeading = screen
      .getAllByRole('heading', { level: 4 })
      .find((heading) => heading.textContent === 'Maharashtra');
    const maharashtraGroup = maharashtraHeading?.closest(
      '[data-slot="experience-center-state-group"]',
    );

    expect(form).not.toBeNull();
    expect(editedItem).toHaveAttribute('data-editing', 'true');
    expect(maharashtraGroup).toContainElement(editedItem as HTMLElement);
    expect(within(maharashtraGroup as HTMLElement).getByText('Bandra Lounge')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /add experience center/i }),
    ).not.toBeInTheDocument();
  });

  it('removes a center and emits the remaining array', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExperienceCentersEditor value={[whitefield, powai]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /remove whitefield experience center/i }));

    expect(onChange).toHaveBeenCalledWith([powai]);
  });

  it('shows validation errors and does not emit when required fields are missing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExperienceCentersEditor value={[]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /add experience center/i }));
    // Submit with everything blank.
    await user.click(screen.getByRole('button', { name: 'Add center' }));

    expect(await screen.findAllByText(/too small|expected string|required/i)).not.toHaveLength(0);
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects an invalid Google Maps URL without emitting', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExperienceCentersEditor value={[]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /add experience center/i }));
    await user.type(screen.getByLabelText('Name'), 'Test Center');
    await user.type(screen.getByLabelText('Address'), '1 Test Road');
    await user.type(screen.getByLabelText('City'), 'Bengaluru');
    await user.selectOptions(screen.getByLabelText('State'), 'Karnataka');
    await user.type(screen.getByLabelText(/google maps link/i), 'not-a-url');
    await user.click(screen.getByRole('button', { name: 'Add center' }));

    expect(screen.getByLabelText(/google maps link/i)).toHaveAttribute('aria-invalid', 'true');
    expect(onChange).not.toHaveBeenCalled();
  });
});
