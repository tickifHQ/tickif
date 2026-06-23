import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DesignerOnboarding } from '../../src/components/designer-onboarding';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('DesignerOnboarding', () => {
  it('renders the onboarding shell with signed-in context and entity options', () => {
    render(<DesignerOnboarding signedInAs="mahi@test.com" />);

    expect(screen.getByText(/Signed in as/i)).toBeInTheDocument();
    expect(screen.getByText('mahi@test.com')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /set up your space/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /just me/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /interior company \(firm\)/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
  });

  it('moves to the details form after selecting a listing type', async () => {
    const user = userEvent.setup();
    render(<DesignerOnboarding signedInAs="mahi@test.com" />);

    expect(screen.queryByLabelText(/company name/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /interior company \(firm\)/i }));

    expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('walks through the company flow, submits the supported payload, and shows completion', async () => {
    const submit = vi.fn().mockResolvedValue({
      created: true,
      data: {
        profile: {
          id: '11111111-1111-4111-8111-111111111111',
          orgId: 'org-1',
          displayName: 'Antika Interiors',
          entityType: 'company',
          status: 'draft',
          createdAt: '2026-06-18T00:00:00.000Z',
        },
        organization: {
          id: 'org-1',
          name: 'Antika Interiors',
          slug: 'antika-interiors',
        },
      },
    });
    const user = userEvent.setup();

    render(<DesignerOnboarding signedInAs="mahi@test.com" onSubmitOnboarding={submit} />);

    await user.click(screen.getByRole('button', { name: /interior company \(firm\)/i }));
    await user.type(screen.getByLabelText(/company name/i), 'Antika Interiors');
    expect(screen.getByLabelText(/firm type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip to dashboard/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/address/i), '12 Studio Lane, Chennai');

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText(/whatsapp number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/website/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/google business/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText(/services offered/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/founded/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/team size/i)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/services offered/i));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /modular kitchen/i }));
    const servicesSelect = screen.getByLabelText(/services offered/i);
    expect(servicesSelect).toHaveTextContent(
      /Full Home Interiors, Modular Kitchen/i,
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith({
        entityType: 'company',
        userName: 'Antika Interiors',
        companyName: 'Antika Interiors',
        address: '12 Studio Lane, Chennai',
        scopeIds: [],
        themeIds: [],
      });
    });
    expect(await screen.findByText(/You're set up, there/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add your projects/i })).toBeInTheDocument();
  });

  it('surfaces API errors inline', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('Google SSO required for designer onboarding'));
    const user = userEvent.setup();

    render(<DesignerOnboarding signedInAs="mahi@test.com" onSubmitOnboarding={submit} />);

    await user.click(screen.getByRole('button', { name: /just me/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Mahi Studio');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText(/website/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/google business/i)).toBeInTheDocument();
    expect(screen.getByText(/social links/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(/Google SSO required/i)).toBeInTheDocument();
  });
});
