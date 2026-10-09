import type { FeedFacetOptions } from '@/components/feed-filters';
import type { FeedFilterKey } from '@/lib/feed-params';

type LandingCategory = { facet: FeedFilterKey; slug: string; label: string; image: string };

// Editorial order and Figma artwork; availability and destinations use real taxonomy terms.
const categories: LandingCategory[] = [
  { facet: 'room', slug: 'living-room', label: 'Living rooms', image: 'filter-living.png' },
  { facet: 'room', slug: 'modular-kitchen', label: 'Kitchens', image: 'filter-kitchen.png' },
  { facet: 'room', slug: 'master-bedroom', label: 'Bedrooms', image: 'filter-bedroom.png' },
  { facet: 'room', slug: 'pooja-room', label: 'Pooja units', image: 'filter-pooja.png' },
  { facet: 'room', slug: 'dining', label: 'Dining', image: 'filter-dining.png' },
  { facet: 'room', slug: 'bathroom', label: 'Bathrooms', image: 'filter-bathroom.png' },
  { facet: 'budgetBand', slug: '5l-10l', label: '₹5L–₹10L', image: 'filter-budget.png' },
  { facet: 'propertyType', slug: 'villa', label: 'Villas', image: 'filter-villa.png' },
  {
    facet: 'propertyType',
    slug: 'commercial-workspace',
    label: 'Workspaces',
    image: 'filter-office.png',
  },
];

const shortcuts: LandingCategory[] = [
  { facet: 'room', slug: 'modular-kitchen', label: 'Modular kitchen', image: 'try-kitchen.png' },
  { facet: 'bhk', slug: '3-bhk', label: '3BHK homes', image: 'try-3bhk.png' },
  { facet: 'room', slug: 'living-room', label: 'Cosy living room', image: 'try-living.png' },
  { facet: 'room', slug: 'dining', label: 'Dining ideas', image: 'try-dining.png' },
];

export function landingCategories(options: FeedFacetOptions) {
  return categories.filter(({ facet, slug }) => options[facet]?.some((term) => term.slug === slug));
}

export function landingShortcuts(options: FeedFacetOptions) {
  return shortcuts
    .filter(({ facet, slug }) => options[facet]?.some((term) => term.slug === slug))
    .map(({ facet, slug, label, image }) => ({
      href: `/?${facet}=${encodeURIComponent(slug)}`,
      label,
      image: `/images/landing/${image}`,
    }));
}
