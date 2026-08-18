import type { ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makePublicProject } from '../fixtures/public-project';

vi.mock('@/components/enquiry-cta', () => ({
  EnquiryCta: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}));

const { PublicProjectStory } = await import('../../src/components/public-project-story');

describe('PublicProjectStory', () => {
  it('navigates between the available room sections with the active photo count', () => {
    const project = makePublicProject();
    const kitchenId = '88888888-8888-4888-8888-888888888888';
    project.rooms.push({
      id: kitchenId,
      roomType: { slug: 'kitchen', label: 'Kitchen' },
      name: 'Kitchen',
      description: null,
      sortOrder: 1,
      photoCount: 1,
    });
    project.images.push({
      ...project.images[0]!,
      id: '99999999-9999-4999-8999-999999999999',
      roomId: kitchenId,
      roomName: 'Kitchen',
      url: 'https://images.example.com/kitchen.jpg',
      sortOrder: 1,
    });

    render(<PublicProjectStory project={project} />);

    const roomNavigation = screen.getByRole('navigation', { name: 'Project rooms' });
    const roomCarousel = roomNavigation.closest('[data-slot="carousel"]');
    const livingRoomLink = within(roomNavigation).getByRole('link', { name: 'Living Room 1' });
    const kitchenLink = within(roomNavigation).getByRole('link', { name: 'Kitchen 1' });
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);

    expect(roomCarousel).toHaveClass('w-fit', 'max-w-full');
    expect(livingRoomLink).toHaveAttribute('aria-current', 'location');
    expect(livingRoomLink).toHaveAttribute(
      'href',
      '#project-room-22222222-2222-4222-8222-222222222222',
    );
    expect(kitchenLink).not.toHaveAttribute('aria-current');
    const kitchenSection = document.querySelector(kitchenLink.getAttribute('href')!);
    expect(kitchenSection).toHaveClass('scroll-mt-6');
    expect(kitchenSection).toHaveAttribute('aria-labelledby', `project-room-${kitchenId}-heading`);
    fireEvent.click(kitchenLink);

    expect(kitchenLink).toHaveAttribute('aria-current', 'location');
    expect(kitchenLink).toHaveAccessibleName('Kitchen 1');
    expect(livingRoomLink).not.toHaveAttribute('aria-current');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

    scrollIntoView.mockRestore();
  });

  it('renders room images and sourced materials and finishes', () => {
    const project = makePublicProject();
    project.images.push({
      ...project.images[0]!,
      id: '99999999-9999-4999-8999-999999999999',
      url: 'https://images.example.com/living-room-detail.jpg',
      sortOrder: 1,
    });
    render(<PublicProjectStory project={project} />);

    const roomGallery = screen.getByRole('region', { name: 'Room-by-room project gallery' });
    expect(within(roomGallery).getByRole('heading', { name: 'Living Room' })).toBeInTheDocument();
    expect(within(roomGallery).getByText('2 photos')).toBeInTheDocument();
    expect(
      within(roomGallery).getAllByRole('link', { name: 'Open Living Room image' })[0],
    ).toHaveAttribute('href', `/image/${project.images[0]!.id}`);
    expect(within(roomGallery).getByText('Teak')).toBeInTheDocument();
    expect(within(roomGallery).getByText('Matte')).toBeInTheDocument();

    const roomImage = within(roomGallery).getAllByRole('img')[0]!;
    expect(roomImage).toHaveAttribute('loading', 'lazy');
    expect(roomImage).toHaveAttribute('decoding', 'async');
    expect(roomImage).toHaveAttribute('draggable', 'false');
    expect(fireEvent.contextMenu(roomImage)).toBe(false);
  });

  it('renders the published homeowner narrative and its verified attribution', () => {
    const project = makePublicProject();
    render(<PublicProjectStory project={project} />);

    const narrative = screen.getByRole('region', { name: /their words/i });
    expect(within(narrative).getByText(project.narrative!.body)).toBeInTheDocument();
    expect(within(narrative).getByText('Priya K., 3 BHK in Mylapore')).toBeInTheDocument();
    expect(within(narrative).getByLabelText('Verified consultation')).toBeInTheDocument();
  });

  it('renders an honest narrative empty state when no review is published', () => {
    render(<PublicProjectStory project={makePublicProject({ narrative: null })} />);

    expect(
      screen.getByText('No homeowner narrative has been published for this project yet.'),
    ).toBeInTheDocument();
  });

  it('links recurring motifs to public discovery', () => {
    render(<PublicProjectStory project={makePublicProject()} />);

    const motifs = screen.getByRole('region', { name: /Recurring notes/i });
    expect(within(motifs).getByRole('link', { name: /Teak 2 homes/ })).toHaveAttribute(
      'href',
      '/?q=Teak',
    );
    expect(within(motifs).getByText(/across Anika Spaces' published homes/i)).toBeInTheDocument();

    const motifImage = motifs.querySelector('img');
    if (!motifImage) throw new Error('Expected a recurring motif thumbnail.');
    expect(motifImage).toHaveAttribute('loading', 'lazy');
    expect(motifImage).toHaveAttribute('decoding', 'async');
    expect(motifImage).toHaveAttribute('draggable', 'false');
    expect(fireEvent.contextMenu(motifImage)).toBe(false);
  });

  it('does not render an empty motif thumbnail when this project has no matching image', () => {
    const project = makePublicProject({
      recurringMotifs: [{ kind: 'material', slug: 'brass', label: 'Brass', projectCount: 3 }],
    });

    render(<PublicProjectStory project={project} />);

    const motifLink = screen.getByRole('link', { name: /Brass 3 homes/ });
    expect(motifLink.querySelector('img')).toBeNull();
  });
});
