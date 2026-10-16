import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { portfolioCompanyAboutSchema } from '@repo/contracts';
import { ProfileCompanyAbout } from '../../src/components/profile-company-about';
import { makePublicPortfolio } from '../fixtures/public-portfolio';

describe('company about section', () => {
  it('shows an uploaded founder photo in both design slots before a name is entered', () => {
    const portfolio = makePublicPortfolio({
      aboutCompany: portfolioCompanyAboutSchema.parse({ story: 'Our story' }),
      founderPhotoUrl: 'https://cdn.test/founder.webp',
    });
    const { container } = render(<ProfileCompanyAbout portfolio={portfolio} />);
    expect(container.querySelector('.profile-company-avatar img')).toHaveAttribute(
      'src',
      portfolio.founderPhotoUrl,
    );
    expect(screen.getByRole('img', { name: 'Company founder' })).toHaveAttribute(
      'src',
      portfolio.founderPhotoUrl,
    );
  });
  it('renders company copy and founder facts independently of the testimonial', () => {
    const portfolio = makePublicPortfolio({
      aboutCompany: portfolioCompanyAboutSchema.parse({
        headline: 'Designed around your life',
        story: 'We are a local company.',
        founderName: 'Priya',
        founderRole: 'Founder',
        services: 'Interiors',
        languages: 'Tamil, English',
      }),
    });
    render(<ProfileCompanyAbout portfolio={portfolio} />);
    const about = within(screen.getByRole('region', { name: 'About the company' }));
    expect(about.getByRole('heading', { name: 'Designed around your life' })).toBeVisible();
    expect(about.getByText('We are a local company.')).toBeVisible();
    expect(about.getByText('Interiors')).toBeVisible();
    expect(about.getByText('Tamil, English')).toBeVisible();
    expect(about.queryByText('Team')).not.toBeInTheDocument();
    expect(about.getByLabelText('Priya initials')).toBeVisible();
    expect(about.queryByRole('blockquote')).not.toBeInTheDocument();
  });
  it('uses saved company photos and never substitutes a client review avatar', () => {
    const portfolio = makePublicPortfolio({
      aboutCompany: portfolioCompanyAboutSchema.parse({ story: 'Our story', founderName: 'Priya' }),
      founderPhotoUrl: 'https://cdn.test/founder.webp',
      studioPhotoUrl: 'https://cdn.test/studio.webp',
    });
    render(<ProfileCompanyAbout portfolio={portfolio} />);
    expect(screen.getByRole('img', { name: 'Priya' })).toHaveAttribute(
      'src',
      portfolio.founderPhotoUrl,
    );
    expect(screen.getByRole('img', { name: /studio and work/ })).toHaveAttribute(
      'src',
      portfolio.studioPhotoUrl,
    );
  });
  it('hides an explicitly empty story even if there is a testimonial', () => {
    render(
      <ProfileCompanyAbout
        portfolio={makePublicPortfolio({
          aboutCompany: portfolioCompanyAboutSchema.parse({ story: '' }),
        })}
      />,
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
  it('uses the existing company bio and top project photo for a legacy portfolio', () => {
    const portfolio = makePublicPortfolio({ bio: 'Our existing company story' });
    render(<ProfileCompanyAbout portfolio={portfolio} />);
    expect(screen.getByText(portfolio.bio!)).toBeVisible();
    expect(screen.getByRole('img', { name: /studio and work/ })).toHaveAttribute(
      'src',
      portfolio.projects.projects[0]?.coverImageUrl,
    );
  });
  it('honours the company section visibility setting', () => {
    const portfolio = makePublicPortfolio();
    portfolio.sections.aboutCompany = false;
    render(<ProfileCompanyAbout portfolio={portfolio} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
