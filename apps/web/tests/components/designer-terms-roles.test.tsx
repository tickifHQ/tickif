import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DesignerTermsRoles } from '../../src/components/designer-terms-roles';
import { mockTeamWorkspace } from '../../src/components/designer-terms-roles-mock-data';

describe('DesignerTermsRoles', () => {
  it('renders the complete five-role team preview from the Figma design', () => {
    render(<DesignerTermsRoles />);

    expect(screen.getByRole('heading', { name: 'Team & roles' })).toBeInTheDocument();
    expect(screen.getByText('5 of 10 seats used · Corporate plan')).toBeInTheDocument();
    expect(screen.getByText('Anika Subramanian')).toBeInTheDocument();
    expect(screen.getByText('Riya P.')).toBeInTheDocument();
    expect(screen.getByText('Arjun M.')).toBeInTheDocument();
    expect(screen.getByText('Kavya S.')).toBeInTheDocument();
    expect(screen.getByText('Meera K.')).toBeInTheDocument();
    expect(screen.getAllByText('Admin')).not.toHaveLength(0);
    expect(screen.getAllByText('Designer')).not.toHaveLength(0);
    expect(screen.getAllByText('Project manager')).not.toHaveLength(0);
    expect(screen.getAllByText('Sales & CRM')).not.toHaveLength(0);
    expect(screen.getAllByText('Accountant')).not.toHaveLength(0);
    expect(screen.getByText('junior@livspace.in')).toBeInTheDocument();
    expect(screen.getByText('copywriter@livspace.in')).toBeInTheDocument();
  });

  it('renders a valid empty progress state when no seats are configured', () => {
    render(
      <DesignerTermsRoles initialWorkspace={{ ...mockTeamWorkspace, members: [], seatLimit: 0 }} />,
    );

    expect(screen.getByRole('progressbar', { name: 'Seats used' }).firstElementChild).toHaveStyle({
      width: '0%',
    });
  });

  it('uses the shared fancy button treatment for reminder actions', () => {
    render(<DesignerTermsRoles />);

    const remindButton = screen.getAllByRole('button', { name: 'Remind' })[0];
    expect(remindButton).toHaveClass(
      'bg-button-fancy',
      'text-button-fancy-foreground',
      'shadow-button-fancy',
    );
  });

  it('adds a local preview invitation without calling a backend', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles />);

    const email = screen.getByRole('textbox', { name: 'Work email' });
    await user.clear(email);
    await user.type(email, 'new.member@example.com');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Role' }), 'accountant');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(screen.getByText('new.member@example.com')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Preview invitation added for new.member@example.com. No email was sent.',
    );
    expect(screen.getByText('3', { selector: 'p' })).toBeInTheDocument();
  });

  it('prevents duplicate preview invitations', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles />);

    const email = screen.getByRole('textbox', { name: 'Work email' });
    await user.clear(email);
    await user.type(email, 'junior@livspace.in');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(screen.getAllByText('junior@livspace.in')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(
      'junior@livspace.in already belongs to this team or has a pending invite.',
    );
  });

  it('revokes a pending invitation in local preview state', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles />);

    const pendingSection = screen.getByRole('heading', { name: 'Pending invites' }).parentElement;
    expect(pendingSection).not.toBeNull();
    await user.click(within(pendingSection!).getAllByRole('button', { name: 'Revoke' })[0]!);

    expect(screen.queryByText('junior@livspace.in')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Preview invitation for junior@livspace.in was revoked.',
    );
  });
});
