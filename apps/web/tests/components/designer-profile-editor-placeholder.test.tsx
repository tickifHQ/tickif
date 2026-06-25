import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DesignerProfileEditorPlaceholder } from '../../src/components/designer-profile-editor-placeholder';

describe('DesignerProfileEditorPlaceholder', () => {
  it('renders individual profile edit sections and editable fields', () => {
    render(<DesignerProfileEditorPlaceholder />);

    expect(screen.getByText(/profile basics/i)).toBeInTheDocument();
    expect(screen.getByText(/contact and links/i)).toBeInTheDocument();
    expect(screen.queryByText(/company details/i)).not.toBeInTheDocument();
    expect(screen.getByText(/footprint/i)).toBeInTheDocument();

    expect(screen.getByLabelText(/display name/i)).toHaveValue('Your Interior Studio');
    expect(screen.getByLabelText(/listing type/i)).toHaveValue('individual');
    expect(screen.getByLabelText(/bio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/whatsapp \/ phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/website/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/google business url/i)).toBeInTheDocument();
    expect(screen.queryByText(/placeholder/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/preview save behavior/i)).not.toBeInTheDocument();
  });

  it('shows company details when listing type is company', async () => {
    const user = userEvent.setup();
    render(<DesignerProfileEditorPlaceholder />);

    await user.selectOptions(screen.getByLabelText(/listing type/i), 'company');

    expect(screen.getByText(/company details/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/firm type/i)).toHaveValue('Studio');
    expect(screen.getByLabelText(/founded year/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/staff count/i)).toBeInTheDocument();
  });
});
