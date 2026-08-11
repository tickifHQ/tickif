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
    const livingRoomLink = within(roomNavigation).getByRole('link', { name: 'Living Room 1' });
    const kitchenLink = within(roomNavigation).getByRole('link', { name: 'Kitchen 1' });
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);

    expect(livingRoomLink).toHaveAttribute('aria-current', 'location');
    expect(livingRoomLink).toHaveAttribute(
      'href',
      '#project-room-22222222-2222-4222-8222-222222222222',
    );
    expect(kitchenLink).not.toHaveAttribute('aria-current');

    fireEvent.click(kitchenLink);

    expect(kitchenLink).toHaveAttribute('aria-current', 'location');
    expect(kitchenLink).toHaveAccessibleName('Kitchen 1');
    expect(livingRoomLink).not.toHaveAttribute('aria-current');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

    scrollIntoView.mockRestore();
  });

  it('renders room images and sourced materials and finishes', () => {
    const project = makePublicProject();
    render(<PublicProjectStory project={project} />);

    const roomGallery = screen.getByRole('region', { name: 'Room-by-room project gallery' });
    expect(within(roomGallery).getByRole('heading', { name: 'Living Room' })).toBeInTheDocument();
    expect(within(roomGallery).getByText('1 photo')).toBeInTheDocument();
    expect(
      within(roomGallery).getByRole('link', { name: 'Open Living Room image' }),
    ).toHaveAttribute('href', `/image/${project.images[0]!.id}`);
    expect(within(roomGallery).getByText('Teak')).toBeInTheDocument();
    expect(within(roomGallery).getByText('Matte')).toBeInTheDocument();
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
  });
});
