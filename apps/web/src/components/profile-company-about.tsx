import type { PublicPortfolioResponse } from '@repo/contracts';
import type { CSSProperties } from 'react';
import { CompanyStory } from '@/components/profile-company-story';

const icons = {
  Services: 'services',
  'Known for': 'styles',
  Cities: 'cities',
  Team: 'team',
  Languages: 'languages',
} as const;

export function ProfileCompanyAbout({ portfolio }: { portfolio: PublicPortfolioResponse }) {
  const about = portfolio.aboutCompany;
  // An explicit empty story hides the section; legacy profiles can use their own bio.
  const story = about ? about.story.trim() : portfolio.bio?.trim();
  if (!story || portfolio.sections.aboutCompany === false) return null;
  const headline = about?.headline.trim() || portfolio.tagline || `About ${portfolio.displayName}`;
  const image =
    portfolio.studioPhotoUrl ||
    portfolio.projects.projects[0]?.coverImageUrl ||
    portfolio.heroCoverUrl;
  const founder = about?.founderName.trim();
  const showFounder = Boolean(founder || portfolio.founderPhotoUrl);
  const initials = (founder || portfolio.displayName)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  const facts = [
    ['Services', about?.services],
    ['Known for', about?.styles],
    ['Cities', portfolio.cities.join(', ')],
    ['Team', about?.team],
    ['Languages', about?.languages],
  ].filter((entry): entry is [keyof typeof icons, string] => Boolean(entry[1]?.trim()));

  return (
    <section
      id="about"
      aria-label="About the company"
      className="profile-shell profile-company-section"
    >
      <div className="profile-company-panel">
        <div className="profile-company-main">
          <div className="profile-company-heading">
            <p className="profile-company-pill">
              <img src="/profile/about/dot.svg" alt="" width={7} height={7} />
              About the studio
            </p>
            <h2>{headline}</h2>
          </div>
          <div className="profile-company-story">
            <CompanyStory story={story} />
          </div>
          {showFounder ? (
            <div className="profile-company-signature">
              <span className="profile-company-avatar">
                {portfolio.founderPhotoUrl ? (
                  <img src={portfolio.founderPhotoUrl} alt="" />
                ) : (
                  initials
                )}
              </span>
              <div>
                <p>{founder}</p>
                {about?.founderRole ? <span>{about.founderRole}</span> : null}
              </div>
            </div>
          ) : null}
          {image || showFounder ? (
            <div className="profile-company-images">
              {image ? (
                <img
                  className="profile-company-studio-photo"
                  src={image}
                  alt={`${portfolio.displayName} studio and work`}
                />
              ) : null}
              {showFounder ? (
                <div className="profile-company-founder-photo">
                  {portfolio.founderPhotoUrl ? (
                    <img src={portfolio.founderPhotoUrl} alt={founder || 'Company founder'} />
                  ) : (
                    <span aria-label={`${founder} initials`}>{initials}</span>
                  )}
                </div>
              ) : null}
              {image && portfolio.cities[0] ? (
                <p className="profile-company-location">
                  <img src="/profile/about/house.svg" alt="" width={13} height={13} />
                  <span>Studio · {portfolio.cities[0]}</span>
                </p>
              ) : null}
              {portfolio.foundedYear ? (
                <div className="profile-company-established">
                  <span>Est.</span>
                  <strong>{portfolio.foundedYear}</strong>
                </div>
              ) : null}
              {founder ? (
                <div className="profile-company-mobile-founder">
                  <p>{founder}</p>
                  {about?.founderRole ? <span>{about.founderRole}</span> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {facts.length ? (
          <dl
            className="profile-company-facts"
            style={{ '--company-fact-count': facts.length } as CSSProperties}
          >
            {facts.map(([label, value]) => (
              <div key={label}>
                <span className="profile-company-fact-icon">
                  <img src={`/profile/about/${icons[label]}.svg`} alt="" width={14} height={14} />
                </span>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}
