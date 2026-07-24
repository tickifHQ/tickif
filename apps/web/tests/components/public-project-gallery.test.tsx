import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicProjectGallery } from '../../src/components/public-project-gallery';
import { publicDesignerProfileFixture } from '../../src/lib/public-designer-profile-fixture';

describe('PublicProjectGallery', () => {
  it('shows six projects initially and smoothly reveals the remaining projects', () => {
    render(<PublicProjectGallery projects={publicDesignerProfileFixture.projects} />);

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

  it('sorts projects and filters them by property type', () => {
    render(<PublicProjectGallery projects={publicDesignerProfileFixture.projects} />);

    fireEvent.click(screen.getByRole('button', { name: 'Top rated' }));
    expect(
      within(screen.getByTestId('visible-projects')).getAllByRole('heading')[0],
    ).toHaveTextContent('Mylapore Courtyard Home');

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Villa' }));

    expect(screen.getByTestId('project-count')).toHaveTextContent('2 of 2 projects');
    expect(within(screen.getByTestId('visible-projects')).getAllByRole('article')).toHaveLength(2);
  });
});
