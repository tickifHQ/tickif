import { describe, expect, it } from 'vitest';
import {
  formatRating,
  heroCaption,
  heroProject,
  projectFilters,
  socialLabel,
  strapline,
  studioInitials,
  studioLocation,
  studioType,
  websiteLabel,
} from '../../src/lib/public-portfolio-view';
import { makeProject, makePublicPortfolio } from '../fixtures/public-portfolio';

describe('studioInitials', () => {
  it('takes the first and last initial of a multi-word name', () => {
    expect(studioInitials('Anika Spaces')).toBe('AS');
    expect(studioInitials('Studio Aakar Design Works')).toBe('SW');
  });

  it('takes the first two characters of a single-word name', () => {
    expect(studioInitials('Aakar')).toBe('AA');
  });

  it('handles extra whitespace and an empty name', () => {
    expect(studioInitials('  Anika   Spaces  ')).toBe('AS');
    expect(studioInitials('   ')).toBe('—');
  });
});

describe('studioType', () => {
  it('prefers the designer-entered firm type', () => {
    expect(studioType({ firmType: 'Architecture Practice', entityType: 'company' })).toBe(
      'Architecture Practice',
    );
  });

  it('falls back to a label implied by the entity type', () => {
    expect(studioType({ firmType: null, entityType: 'company' })).toBe('Design Studio');
    expect(studioType({ firmType: '   ', entityType: 'individual' })).toBe('Interior Designer');
  });
});

describe('studioLocation', () => {
  it('shows the primary city and a count when the studio covers several', () => {
    expect(studioLocation({ cities: ['Chennai', 'Coimbatore', 'Madurai'] }, [])).toBe(
      'Chennai · 3 cities',
    );
  });

  it('shows just the city when there is only one', () => {
    expect(studioLocation({ cities: ['Chennai'] }, [])).toBe('Chennai');
  });

  it('falls back to a published project city when the footprint is empty', () => {
    expect(
      studioLocation({ cities: [] }, [makeProject({ city: null }), makeProject({ city: 'Kochi' })]),
    ).toBe('Kochi');
  });

  it('returns null when nothing is known', () => {
    expect(studioLocation({ cities: [] }, [makeProject({ city: null })])).toBeNull();
  });
});

describe('strapline', () => {
  it('prefers the tagline, then the bio', () => {
    expect(strapline({ tagline: 'Calm homes', bio: 'A studio' })).toBe('Calm homes');
    expect(strapline({ tagline: null, bio: 'A studio' })).toBe('A studio');
    expect(strapline({ tagline: '  ', bio: '  ' })).toBeNull();
  });
});

describe('heroProject and heroCaption', () => {
  it('picks the first project that actually has a cover image', () => {
    const withCover = makeProject({ id: 'b', coverImageUrl: 'https://cdn.test/b.jpg' });
    const hero = heroProject([makeProject({ id: 'a', coverImageUrl: null }), withCover]);

    expect(hero?.id).toBe('b');
  });

  it('captions with the project title and its nearest place name', () => {
    expect(heroCaption(makeProject({ title: 'Adyar Penthouse', locality: 'Adyar' }))).toBe(
      'Adyar Penthouse · Adyar',
    );
    expect(
      heroCaption(makeProject({ title: 'Adyar Penthouse', locality: null, city: 'Chennai' })),
    ).toBe('Adyar Penthouse · Chennai');
    expect(heroCaption(null)).toBeNull();
  });
});

describe('projectFilters', () => {
  it('derives the dwelling type from each property type, deduped and sorted', () => {
    const filters = projectFilters([
      makeProject({ id: 'a', propertyType: '4 BHK · Villa' }),
      makeProject({ id: 'b', propertyType: '3 BHK · Apartment' }),
      makeProject({ id: 'c', propertyType: '2 BHK · Apartment' }),
      makeProject({ id: 'd', propertyType: null }),
    ]);

    expect(filters).toEqual(['Apartment', 'Villa']);
  });

  it('handles a property type with no separator', () => {
    expect(projectFilters([makeProject({ propertyType: 'Apartment' })])).toEqual(['Apartment']);
  });
});

describe('formatRating', () => {
  it('always renders one decimal place', () => {
    expect(formatRating(5)).toBe('5.0');
    expect(formatRating(4.75)).toBe('4.8');
  });
});

describe('socialLabel and websiteLabel', () => {
  it('prefixes a bare handle with @ but leaves an existing one alone', () => {
    expect(socialLabel('anika')).toBe('@anika');
    expect(socialLabel('@anika')).toBe('@anika');
  });

  it('shows host and path for a handle entered as a full URL', () => {
    expect(socialLabel('https://instagram.com/anika')).toBe('instagram.com/anika');
  });

  it('strips the scheme from a website URL', () => {
    expect(websiteLabel('https://anikaspaces.in/')).toBe('anikaspaces.in');
    expect(websiteLabel('https://anikaspaces.in/studio')).toBe('anikaspaces.in/studio');
  });

  it('degrades gracefully on an unparseable value', () => {
    expect(websiteLabel('anikaspaces.in')).toBe('anikaspaces.in');
    expect(socialLabel('https://')).toBe('https://');
  });
});

describe('fixtures stay in sync with the contract', () => {
  it('builds a portfolio whose derived view values are all resolvable', () => {
    const portfolio = makePublicPortfolio();

    expect(studioType(portfolio)).toBe('Interior Design Studio');
    expect(studioLocation(portfolio, portfolio.projects.projects)).toBe('Chennai');
    expect(strapline(portfolio)).toBe('Quiet, light-filled homes with timeless materials.');
  });
});
