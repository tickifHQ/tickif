import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicProjectGallery } from '../../src/components/public-project-gallery';
import { makeProject, makeProjects } from '../fixtures/public-portfolio';

const fetchDesignerProjects = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/public-portfolio-api', () => ({
  fetchDesignerProjects,
}));

// Gallery tests exercise pagination/filtering; likes have their own interaction suite.
vi.mock('../../src/components/project-like-button', () => ({
  ProjectLikeButton: () => <button type="button">Like project</button>,
}));

const PROFILE_ID = '22222222-2222-4222-8222-222222222222';

function renderGallery(
  projects = makeProjects(9),
  page: { page?: number; limit?: number; hasMore?: boolean } = {},
) {
  return render(
    <PublicProjectGallery
      profileId={PROFILE_ID}
      initialPage={{
        projects,
        page: page.page ?? 1,
        limit: page.limit ?? 30,
        hasMore: page.hasMore ?? false,
      }}
      studioName="Anika Spaces"
      emptyMessage="No published projects yet."
    />,
  );
}

describe('PublicProjectGallery', () => {
  beforeEach(() => {
    fetchDesignerProjects.mockReset();
  });

  it('shows six projects initially and smoothly reveals the rest of the loaded page', () => {
    renderGallery();

    expect(within(screen.getByTestId('visible-projects')).getAllByRole('article')).toHaveLength(6);
    expect(screen.getByTestId('project-count')).toHaveTextContent('6 of 9 projects');

    fireEvent.click(screen.getByRole('button', { name: 'View all projects' }));

    expect(screen.getByTestId('project-count')).toHaveTextContent('9 of 9 projects');
    expect(screen.getByRole('button', { name: 'Show fewer projects' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('additional-projects')).toHaveAttribute('aria-hidden', 'false');
  });

  it('sorts on the fields the API returns and filters by property type', () => {
    const projects = [
      makeProject({ id: 'a', title: 'Villa High', rating: 5, propertyType: '4 BHK · Villa' }),
      makeProject({ id: 'b', title: 'Flat Mid', rating: 4.2, propertyType: '3 BHK · Apartment' }),
      makeProject({ id: 'c', title: 'Villa Low', rating: 4, propertyType: '4 BHK · Villa' }),
    ];
    renderGallery(projects);

    fireEvent.click(screen.getByRole('button', { name: 'Top rated' }));
    expect(
      within(screen.getByTestId('visible-projects')).getAllByRole('heading')[0],
    ).toHaveTextContent('Villa High');

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Villa' }));

    expect(screen.getByTestId('project-count')).toHaveTextContent('2 of 2 projects');
    expect(within(screen.getByTestId('visible-projects')).getAllByRole('article')).toHaveLength(2);
  });

  it('derives filter options from the loaded projects', () => {
    renderGallery([
      makeProject({ id: 'a', propertyType: '3 BHK · Apartment' }),
      makeProject({ id: 'b', propertyType: '2 BHK · Studio' }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));

    expect(screen.getByRole('button', { name: 'Apartment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Studio' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Villa' })).not.toBeInTheDocument();
  });

  it('hides the filter control when every project shares one property type', () => {
    renderGallery([makeProject({ id: 'a', propertyType: '3 BHK · Apartment' })]);

    expect(screen.queryByRole('button', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('fetches the next page from the API when more projects exist', async () => {
    const nextProjects = [makeProject({ id: 'next-1', title: 'Second Page Home' })];
    fetchDesignerProjects.mockResolvedValue({
      projects: nextProjects,
      page: 2,
      limit: 30,
      hasMore: false,
    });

    renderGallery(makeProjects(9), { hasMore: true });

    fireEvent.click(screen.getByRole('button', { name: 'View all projects' }));

    await waitFor(() =>
      expect(screen.getByTestId('project-count')).toHaveTextContent('10 of 10 projects'),
    );
    expect(fetchDesignerProjects).toHaveBeenCalledWith(PROFILE_ID, { page: 2, limit: 30 });
    expect(screen.getByText('Second Page Home')).toBeInTheDocument();
  });

  it('keeps loaded projects on screen and explains a failed page fetch', async () => {
    fetchDesignerProjects.mockRejectedValue(new Error('offline'));

    renderGallery(makeProjects(9), { hasMore: true });

    fireEvent.click(screen.getByRole('button', { name: 'View all projects' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Could not load more projects. Please try again.',
    );
    expect(screen.getByTestId('project-count')).toHaveTextContent('9 of 9 projects');
  });

  it('shows the empty message when the designer has published nothing', () => {
    renderGallery([]);

    expect(screen.getByText('No published projects yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('visible-projects')).not.toBeInTheDocument();
  });
});
