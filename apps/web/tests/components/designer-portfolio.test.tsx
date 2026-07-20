import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DesignerPortfolio } from '../../src/components/designer-portfolio';

function getTrustHeaderRow() {
  const titleButton = screen.getByRole('button', { name: /^trust & credentials/i });
  const headerRow = titleButton.parentElement;
  if (!headerRow) throw new Error('Trust header row not found');
  return { titleButton, headerRow };
}

describe('DesignerPortfolio', () => {
  it('renders the portfolio settings with a live preview URL', () => {
    render(<DesignerPortfolio />);

    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^link & url/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^customizations/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^share block/i })).toBeInTheDocument();
    expect(screen.getAllByText('tickif.in/livspace').length).toBeGreaterThan(0);
  });

  it('expands and collapses a section from its header button', async () => {
    const user = userEvent.setup();
    render(<DesignerPortfolio />);

    const { titleButton } = getTrustHeaderRow();
    expect(titleButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByAltText('Verified')).not.toBeInTheDocument();

    await user.click(titleButton);
    expect(titleButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByAltText('Verified')).toBeInTheDocument();

    await user.click(titleButton);
    expect(titleButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByAltText('Verified')).not.toBeInTheDocument();
  });

  it('keeps a collapsed section collapsed when its visibility switch is toggled', async () => {
    const user = userEvent.setup();
    render(<DesignerPortfolio />);

    const { titleButton, headerRow } = getTrustHeaderRow();
    const sectionSwitch = within(headerRow).getByRole('switch');
    expect(sectionSwitch).toHaveAttribute('aria-checked', 'true');

    await user.click(sectionSwitch);

    expect(sectionSwitch).toHaveAttribute('aria-checked', 'false');
    expect(titleButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByAltText('Verified')).not.toBeInTheDocument();
  });

  it('sanitizes the slug input and reflects it in the preview URLs', async () => {
    const user = userEvent.setup();
    render(<DesignerPortfolio />);

    const slugInput = screen.getByDisplayValue('livspace');
    await user.clear(slugInput);
    await user.type(slugInput, 'My Studio 42!');

    expect(slugInput).toHaveValue('mystudio42');
    expect(screen.getAllByText('tickif.in/mystudio42').length).toBeGreaterThan(0);
    expect(screen.queryByText('tickif.in/livspace')).not.toBeInTheDocument();
  });
});
