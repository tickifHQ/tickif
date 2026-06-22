export type FeedProject = {
  id: string;
  seed: string;
  title: string;
  studio: string;
  city: string;
  rating: number;
  budget: string;
  tags: [string, string];
  imageHeight: number;
};

export const FEED_IMAGE_WIDTH = 480;

type BaseProject = Omit<FeedProject, 'id' | 'seed' | 'imageHeight'> & { slug: string };

const base: BaseProject[] = [
  { slug: 'compact-studio-magic', title: 'Compact Studio Magic', studio: 'Micro Design Lab', city: 'Lower Parel, Mumbai', rating: 4.5, budget: '₹3–5L', tags: ['Modern Minimalist', 'Studio'] },
  { slug: 'traditional-meets-modern', title: 'Traditional Meets Modern', studio: 'Nila Interiors', city: 'Mylapore, Chennai', rating: 4.9, budget: '₹15–18L', tags: ['Traditional', '3 BHK'] },
  { slug: 'industrial-chic-apartment', title: 'Industrial Chic Apartment', studio: 'Studio Noir', city: 'Indiranagar, Bangalore', rating: 4.7, budget: '₹8–10L', tags: ['Industrial', '2 BHK'] },
  { slug: 'maximalist-color-story', title: 'Maximalist Color Story', studio: 'Anika Spaces', city: 'Velachery, Chennai', rating: 4.6, budget: '₹25–30L', tags: ['Bohemian', '4 BHK'] },
  { slug: 'serene-modern-living', title: 'Serene Modern Living', studio: 'Anika Spaces', city: 'Adyar, Chennai', rating: 4.8, budget: '₹12–15L', tags: ['Contemporary', '3 BHK'] },
  { slug: 'scandinavian-retreat', title: 'Scandinavian Retreat', studio: 'White Canvas Co.', city: 'Gachibowli, Hyderabad', rating: 4.5, budget: '₹6–8L', tags: ['Scandinavian', '2 BHK'] },
  { slug: 'warm-contemporary-home', title: 'Warm Contemporary Home', studio: 'Nila Interiors', city: 'OMR, Chennai', rating: 4.7, budget: '₹18–22L', tags: ['Contemporary', '4 BHK'] },
  { slug: 'kitchen-transformation', title: 'Kitchen Transformation', studio: 'Studio Noir', city: 'JP Nagar, Bangalore', rating: 4.6, budget: '₹4–5L', tags: ['Modular', 'Kitchen'] },
  { slug: 'warm-walnut-family-home', title: 'Warm Walnut Family Home', studio: 'Kanan Design', city: 'Baner, Pune', rating: 4.8, budget: '₹14–16L', tags: ['Walnut & Cane', '3 BHK'] },
  { slug: 'south-indian-traditional', title: 'South Indian Traditional', studio: 'Nila Interiors', city: 'T. Nagar, Chennai', rating: 4.9, budget: '₹18–22L', tags: ['Traditional', '3 BHK'] },
  { slug: 'cozy-first-home', title: 'Cozy First Home', studio: 'Micro Design Lab', city: 'Whitefield, Bangalore', rating: 4.6, budget: '₹3–5L', tags: ['Scandinavian', '1 BHK'] },
  { slug: 'coastal-calm-villa', title: 'Coastal Calm Villa', studio: 'Anika Spaces', city: 'Panjim, Goa', rating: 4.9, budget: '₹28–35L', tags: ['Contemporary', '4 BHK'] },
  { slug: 'minimal-white-canvas', title: 'Minimal White Canvas', studio: 'Studio Noir', city: 'Aundh, Pune', rating: 4.8, budget: '₹5–8L', tags: ['Modern Minimalist', '2 BHK'] },
  { slug: 'heritage-courtyard-house', title: 'Heritage Courtyard House', studio: 'Nila Interiors', city: 'Fort Kochi, Kochi', rating: 4.8, budget: '₹25–30L', tags: ['Traditional', '4 BHK'] },
  { slug: 'industrial-loft-studio', title: 'Industrial Loft Studio', studio: 'White Canvas Co.', city: 'Koregaon Park, Pune', rating: 4.5, budget: '₹6–8L', tags: ['Industrial', 'Studio'] },
];

// Heights at FEED_IMAGE_WIDTH=480 — mirror the design's portrait/square card ratios (~0.69–1.0).
const heights = [480, 700, 540, 660, 600, 480, 660, 540, 700, 580, 620, 500, 660, 560];

// Repeat the catalogue to a dense feed like the Figma mock; seed varies per slot so images differ.
export const mockProjects: FeedProject[] = Array.from({ length: 30 }, (_, i) => {
  const b = base[i % base.length]!;
  return {
    ...b,
    id: `${b.slug}-${i}`,
    seed: `${b.slug}-${i}`,
    imageHeight: heights[i % heights.length]!,
  };
});

export function feedImageUrl(seed: string, height: number): string {
  return `https://picsum.photos/seed/${seed}/${FEED_IMAGE_WIDTH}/${height}`;
}
