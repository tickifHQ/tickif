import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProfileCompletionResponse } from '@repo/contracts';
import { DesignerDashboardOverview } from '../../src/components/designer-dashboard-overview';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const completion: ProfileCompletionResponse = {
  score: 20,
  missing: ['bio', 'logo', 'city', 'scope', 'contact'],
  steps: [
    { key: 'signed-in-with-google', label: 'Sign in with Google', done: true },
    { key: 'org-created', label: 'Create your organization', done: true },
    { key: 'profile-completed', label: 'Complete your profile', done: false },
    { key: 'first-project-uploaded', label: 'Upload your first project', done: false },
  ],
};

describe('DesignerDashboardOverview', () => {
  it('renders the welcome state, progress score, and onboarding checklist', () => {
    render(
      <DesignerDashboardOverview
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        completion={completion}
      />,
    );

    expect(screen.getByRole('heading', { name: /welcome, livspace/i })).toBeInTheDocument();
    expect(screen.getByText(/let's get your profile ready to go live/i)).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText(/account creation/i)).toBeInTheDocument();
    expect(screen.getAllByText(/upload your first project/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/complete kyc/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/share the portfolio link in socials/i)).toBeInTheDocument();
  });

  it('links the shipped project actions into the upload flow and keeps unshipped actions disabled', () => {
    render(
      <DesignerDashboardOverview
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        completion={completion}
      />,
    );

    expect(screen.getAllByRole('link', { name: /add new project/i })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /add new project/i }).every((link) => link.getAttribute('href') === '/designer/projects/upload')).toBe(true);
    expect(screen.getByRole('link', { name: /add first project/i })).toHaveAttribute(
      'href',
      '/designer/projects/upload',
    );
    expect(screen.getByRole('button', { name: /complete kyc/i })).toBeDisabled();
    expect(screen.getByRole('link', { name: /manage portfolio/i })).toHaveAttribute(
      'href',
      '/designer/profile',
    );
    expect(screen.getAllByRole('button', { name: /copy link/i })).toHaveLength(2);
  });
});
