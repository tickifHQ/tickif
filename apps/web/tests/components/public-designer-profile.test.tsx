import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublicDesignerProfile } from '../../src/components/public-designer-profile';
import { publicDesignerProfileFixture } from '../../src/lib/public-designer-profile-fixture';

describe('PublicDesignerProfile', () => {
  it('renders every section of the public designer profile', () => {
    render(<PublicDesignerProfile profile={publicDesignerProfileFixture} />);

    expect(screen.getByRole('heading', { name: 'Anika Spaces', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Verified on Tickif' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Selected projects/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /their words/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'What it’s like to work with us.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Anika Spaces', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /A portfolio worth sharing/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: "Let's build something you can't imagine living without.",
      }),
    ).toBeInTheDocument();
  });

  it('renders the complete project and credential collections', () => {
    const { container } = render(<PublicDesignerProfile profile={publicDesignerProfileFixture} />);

    expect(within(screen.getByTestId('visible-projects')).getAllByRole('article')).toHaveLength(6);
    expect(within(container).getByAltText('Identity verified')).toBeInTheDocument();
    expect(within(container).getByAltText('New on Tickif')).toBeInTheDocument();
    expect(within(container).getByAltText('Top performer')).toBeInTheDocument();
    expect(within(container).getByAltText('Established studio')).toBeInTheDocument();
    expect(within(container).getByAltText('Projects published')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '4.7 out of 5 stars' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '4.5 out of 5 stars' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '5 out of 5 stars' })).toBeInTheDocument();
  });

  it('renders the studio identity, stats, and social details', () => {
    render(<PublicDesignerProfile profile={publicDesignerProfileFixture} />);

    const studioSection = screen
      .getByRole('heading', { name: 'Anika Spaces', level: 2 })
      .closest('section');

    if (!studioSection) {
      throw new Error('Studio section was not rendered');
    }

    const studio = within(studioSection);
    expect(studio.getByLabelText('Verified studio')).toBeInTheDocument();
    expect(studio.getByText('Established')).toBeInTheDocument();
    expect(studio.getByText('Projects published')).toBeInTheDocument();
    expect(studio.getByText('₹10L+')).toBeInTheDocument();
    expect(studio.getAllByText('@anika')).toHaveLength(3);
    expect(studio.getByText('anikaspaces.in')).toBeInTheDocument();
  });

  it('keeps the rating-card shadow visible instead of clipping it into a block', () => {
    render(<PublicDesignerProfile profile={publicDesignerProfileFixture} />);

    const ratingSummary = screen
      .getByText('Based on 42 verified reviews')
      .closest('[data-slot="card"]');

    expect(ratingSummary).toHaveClass('shadow-floating-card');
    expect(ratingSummary?.parentElement).toHaveClass('pb-20');
  });

  it('builds displayed and copied profile links from the public web URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<PublicDesignerProfile profile={publicDesignerProfileFixture} />);

    expect(screen.getByText('localhost:3000/d/anika-spaces')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('http://localhost:3000/d/anika-spaces');
  });

  it('routes service-dependent actions through login gating', () => {
    render(<PublicDesignerProfile profile={publicDesignerProfileFixture} />);

    expect(screen.getByRole('link', { name: 'Start a conversation' })).toHaveAttribute(
      'href',
      '/login?next=%2Fd%2Fanika-spaces',
    );
    screen
      .getAllByRole('link', { name: 'Enquire' })
      .forEach((link) =>
        expect(link).toHaveAttribute('href', '/login?next=%2Fd%2Fanika-spaces'),
      );
    expect(screen.getByRole('link', { name: 'Get free consultation' })).toHaveAttribute(
      'href',
      '/login?next=%2Fd%2Fanika-spaces',
    );
  });
});
