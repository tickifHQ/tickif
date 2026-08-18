import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectHeroCarousel } from '../../src/components/project-hero-carousel';
import { makePublicProject } from '../fixtures/public-project';

describe('ProjectHeroCarousel', () => {
  it('renders complete image cards and project navigation controls', () => {
    const project = makePublicProject();

    render(<ProjectHeroCarousel images={project.images} projectTitle={project.title} />);

    expect(screen.getByRole('region', { name: 'Project gallery' })).toHaveAttribute(
      'aria-roledescription',
      'carousel',
    );
    expect(screen.getAllByRole('group')).toHaveLength(project.images.length);
    expect(screen.getByText('Living Room')).toBeInTheDocument();
    expect(screen.getByText('Dining Room')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Living Room image' })).toHaveAttribute(
      'href',
      `/image/${project.images[0]!.id}`,
    );
    expect(screen.getByRole('button', { name: 'Previous project image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next project image' })).toBeInTheDocument();
    expect(screen.getByText('Image 1 of 2')).toBeInTheDocument();

    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('loading', 'eager');
    expect(images[0]).toHaveAttribute('decoding', 'async');
    expect(images[1]).toHaveAttribute('loading', 'lazy');
    expect(images[1]).toHaveAttribute('decoding', 'async');
  });

  it('renders a truthful unavailable state when the public contract has no images', () => {
    render(<ProjectHeroCarousel images={[]} projectTitle="Courtyard Home" />);

    expect(
      screen.getByRole('img', { name: 'Courtyard Home images unavailable' }),
    ).toHaveTextContent('Project images are unavailable');
  });
});
