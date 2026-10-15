import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicProjectGallery } from '../../src/components/public-project-gallery';
import { makeProject, makeProjects } from '../fixtures/public-portfolio';

const fetchDesignerProjects = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/public-portfolio-api', () => ({
  fetchDesignerProjects,
}));

// Gallery tests exercise pagination; view counts have their own interaction suite.
vi.mock('../../src/components/project-view-count', () => ({
  ProjectViewCount: () => (
    <span role="img" aria-label="0 project views">
      0
    </span>
  ),
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

  it('keeps every project page bounded to six items and supports returning to the first page', () => {
    renderGallery();

    expect(within(screen.getByTestId('visible-projects')).getAllByRole('article')).toHaveLength(6);
    expect(screen.queryByTestId('project-count')).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Next projects' }));
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText('Project 6')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next projects' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous projects' }));
    expect(screen.getAllByRole('article')).toHaveLength(6);
  });

  it('renders projects in the API order without the removed sorting and filter chrome', () => {
    const projects = [
      makeProject({ id: 'a', title: 'Villa High', rating: 5, propertyType: '4 BHK · Villa' }),
      makeProject({ id: 'b', title: 'Flat Mid', rating: 4.2, propertyType: '3 BHK · Apartment' }),
      makeProject({ id: 'c', title: 'Villa Low', rating: 4, propertyType: '4 BHK · Villa' }),
    ];
    renderGallery(projects);

    expect(
      within(screen.getByTestId('visible-projects')).getAllByRole('heading')[0],
    ).toHaveTextContent('Villa High');
    expect(screen.queryByRole('button', { name: 'Top rated' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('keeps pagination independent of removed sorting and filtering controls', () => {
    renderGallery(makeProjects(15));
    fireEvent.click(screen.getByRole('button', { name: 'Next projects' }));
    expect(screen.queryByText('Project 0')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('visible-projects')).getAllByRole('heading')[0],
    ).toHaveTextContent('Project 6');
    expect(screen.getAllByRole('article')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: 'Newest' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('does not render filter options from loaded projects', () => {
    renderGallery([
      makeProject({ id: 'a', propertyType: '3 BHK · Apartment' }),
      makeProject({ id: 'b', propertyType: '2 BHK · Studio' }),
    ]);

    expect(screen.queryByRole('button', { name: 'Apartment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Studio' })).not.toBeInTheDocument();
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

    renderGallery(makeProjects(6), { hasMore: true });

    fireEvent.click(screen.getByRole('button', { name: 'Next projects' }));

    await waitFor(() => expect(screen.getByText('Second Page Home')).toBeInTheDocument());
    expect(fetchDesignerProjects).toHaveBeenCalledWith(PROFILE_ID, { page: 2, limit: 30 });
    expect(screen.getByText('Second Page Home')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('keeps loaded projects on screen and explains a failed page fetch', async () => {
    fetchDesignerProjects.mockRejectedValue(new Error('offline'));

    renderGallery(makeProjects(6), { hasMore: true });

    fireEvent.click(screen.getByRole('button', { name: 'Next projects' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Could not load more projects. Please try again.',
    );
    expect(screen.getAllByRole('article')).toHaveLength(6);
    fetchDesignerProjects.mockResolvedValue({
      projects: [makeProject({ id: 'retry', title: 'Retry home' })],
      page: 2,
      limit: 30,
      hasMore: false,
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Next projects' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next projects' }));
    expect(await screen.findByText('Retry home')).toBeInTheDocument();
  });

  it('shows the empty message when the designer has published nothing', () => {
    renderGallery([]);

    expect(screen.getByText('No published projects yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('visible-projects')).not.toBeInTheDocument();
  });
});
