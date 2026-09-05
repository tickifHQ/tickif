import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makePublicProject } from '../fixtures/public-project';

vi.mock('@/components/project-like-button', () => ({ ProjectLikeButton: () => <button>Like</button> }));

vi.mock('@/components/enquiry-cta', () => ({
  EnquiryCta: ({ children, loginHref }: { children: ReactNode; loginHref: string }) => (
    <button data-login-href={loginHref}>{children}</button>
  ),
}));

vi.mock('@/components/project-actions', () => ({
  ProjectActions: () => <div>Project actions</div>,
}));

const { PublicProjectOverview } = await import('../../src/components/public-project-overview');

const canonicalUrl = 'https://tickif.com/projects/11111111-1111-4111-8111-111111111111';

describe('PublicProjectOverview', () => {
  it('renders the sourced first-section fields and established public routes', () => {
    const project = makePublicProject();
    render(<PublicProjectOverview project={project} canonicalUrl={canonicalUrl} />);

    expect(screen.getByRole('heading', { name: project.title })).toBeInTheDocument();
    expect(screen.getAllByText(/Mylapore/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Casagrand First City').length).toBeGreaterThan(0);
    expect(screen.getByText('Apartment')).toBeInTheDocument();
    expect(screen.getByText('₹12–18L')).toBeInTheDocument();
    expect(screen.getByText('4,590')).toBeInTheDocument();
    expect(screen.getByText('Interior Design Execution')).toBeInTheDocument();
    expect(screen.getByText('June 2024')).toBeInTheDocument();
    expect(screen.getByText(project.description!)).toBeInTheDocument();
    expect(screen.getAllByText('Anika Spaces').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Founded 2018/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/8 years of experience/).length).toBeGreaterThan(0);
    const projectCounts = screen.getAllByText('28 Projects');
    expect(projectCounts.length).toBeGreaterThan(0);
    for (const projectCount of projectCounts) {
      expect(
        projectCount.closest('p')?.querySelector('[data-slot="tickif-brand-icon"]'),
      ).toHaveClass('text-muted-foreground');
    }
    expect(screen.getAllByText('published').length).toBeGreaterThan(0);
    expect(screen.getAllByText('4.8').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/36 reviews/).length).toBeGreaterThan(0);
    expect(screen.queryByText('KYC verified')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Verified designer')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View profile' })).toHaveAttribute(
      'href',
      '/d/anika-spaces',
    );
    for (const enquireButton of screen.getAllByRole('button', { name: 'Enquire' })) {
      expect(enquireButton).toHaveAttribute(
        'data-login-href',
        '/login?callbackURL=%2Fprojects%2F11111111-1111-4111-8111-111111111111',
      );
    }
    expect(screen.getAllByRole('link', { name: 'Open Living Room image' })[0]).toHaveAttribute(
      'href',
      `/image/${project.images[0]!.id}`,
    );

    const specifications = screen.getByLabelText('Project specifications');
    expect(specifications).toHaveClass('border', 'border-border-strong');
    expect(specifications).not.toHaveClass('bg-border-strong', 'p-px');
    const locationLabel = within(specifications).getByText('Location');
    const locationSpecification = locationLabel.closest('div');
    expect(locationSpecification).not.toBeNull();
    expect(within(locationSpecification!).getByText('Mylapore, Chennai')).toHaveClass(
      'text-foreground',
    );
    expect(within(locationSpecification!).queryByText('Casagrand First City')).toBeNull();
  });

  it('does not fabricate unavailable review verification claims', () => {
    render(<PublicProjectOverview project={makePublicProject()} canonicalUrl={canonicalUrl} />);

    expect(screen.queryByText(/verified reviews/i)).not.toBeInTheDocument();
  });

  it('omits optional sections and statistics when their source data is unavailable', () => {
    const project = makePublicProject({
      description: null,
      designer: {
        ...makePublicProject().designer,
        avgRating: '0',
        reviewCount: 0,
        foundedYear: null,
        yearsExperience: 0,
      },
    });
    render(<PublicProjectOverview project={project} canonicalUrl={canonicalUrl} />);

    expect(screen.queryByRole('heading', { name: 'About this project' })).not.toBeInTheDocument();
    expect(screen.queryByText(/reviews/)).not.toBeInTheDocument();
    expect(screen.queryByText(/years of experience/)).not.toBeInTheDocument();
  });

  it('falls back to the property label when no building name is available', () => {
    render(
      <PublicProjectOverview
        project={makePublicProject({ buildingName: null })}
        canonicalUrl={canonicalUrl}
      />,
    );

    const specifications = screen.getByLabelText('Project specifications');
    expect(within(specifications).getByText('Property')).toBeInTheDocument();
    expect(within(specifications).getByText('Apartment')).toBeInTheDocument();
    expect(within(specifications).getByText('Mylapore, Chennai')).toBeInTheDocument();
  });
});
