export type PublicDesignerProject = {
  id: string;
  imageSrc: string;
  propertyType: string;
  title: string;
  location: string;
  budget: string;
  year: string;
  rating: number;
  viewCount: number;
  areaSqFt: number;
};

export type PublicDesignerReview = {
  id: string;
  author: string;
  date: string;
  body: string;
  rating: number;
  imageSrc: string;
};

export type PublicDesignerProfileViewModel = {
  slug: string;
  studioName: string;
  studioType: string;
  location: string;
  strapline: string;
  rating: number;
  reviewCount: number;
  completedProjects: number;
  yearsExperience: number;
  typicalBudget: string;
  bookmarkCount: number;
  heroImageSrc: string;
  projects: PublicDesignerProject[];
  reviews: PublicDesignerReview[];
};

/**
 * Temporary presentation data for the E-203 frontend build.
 * Replace this fixture with the public profile APIs when backend wiring begins.
 */
export const publicDesignerProfileFixture = {
  slug: 'anika-spaces',
  studioName: 'Anika Spaces',
  studioType: 'Interior Design Studio',
  location: 'Adyar, Chennai · 3 cities',
  strapline: 'Quiet, light-filled homes with timeless materials.',
  rating: 4.7,
  reviewCount: 42,
  completedProjects: 28,
  yearsExperience: 8,
  typicalBudget: '₹10L+',
  bookmarkCount: 145,
  heroImageSrc: '/illustrations/public-profile/hero-image.jpg',
  projects: [
    {
      id: 'project-01',
      imageSrc: '/illustrations/public-profile/project-01.jpg',
      propertyType: '4 BHK · Apartment',
      title: 'Adyar Penthouse',
      location: 'Adyar, Chennai',
      budget: '₹35–42L',
      year: '2024',
      rating: 4.8,
      viewCount: 1620,
      areaSqFt: 2400,
    },
    {
      id: 'project-02',
      imageSrc: '/illustrations/public-profile/project-02.jpg',
      propertyType: '4 BHK · Apartment',
      title: 'Adyar Penthouse',
      location: 'Adyar, Chennai',
      budget: '₹35–42L',
      year: '2023',
      rating: 4.7,
      viewCount: 1380,
      areaSqFt: 2180,
    },
    {
      id: 'project-03',
      imageSrc: '/illustrations/public-profile/project-03.jpg',
      propertyType: '4 BHK · Apartment',
      title: 'Adyar Penthouse',
      location: 'Adyar, Chennai',
      budget: '₹35–42L',
      year: '2022',
      rating: 4.9,
      viewCount: 2100,
      areaSqFt: 2750,
    },
    {
      id: 'project-04',
      imageSrc: '/illustrations/public-profile/project-04.jpg',
      propertyType: '4 BHK · Apartment',
      title: 'Adyar Penthouse',
      location: 'Adyar, Chennai',
      budget: '₹35–42L',
      year: '2021',
      rating: 4.6,
      viewCount: 940,
      areaSqFt: 1950,
    },
    {
      id: 'project-05',
      imageSrc: '/illustrations/public-profile/project-05.jpg',
      propertyType: '4 BHK · Apartment',
      title: 'Adyar Penthouse',
      location: 'Adyar, Chennai',
      budget: '₹35–42L',
      year: '2023',
      rating: 4.8,
      viewCount: 1740,
      areaSqFt: 2300,
    },
    {
      id: 'project-06',
      imageSrc: '/illustrations/public-profile/project-06.jpg',
      propertyType: '4 BHK · Villa',
      title: 'Adyar Penthouse',
      location: 'Adyar, Chennai',
      budget: '₹35–42L',
      year: '2024',
      rating: 4.9,
      viewCount: 2280,
      areaSqFt: 3200,
    },
    {
      id: 'project-07',
      imageSrc: '/illustrations/public-profile/project-02.jpg',
      propertyType: '3 BHK · Apartment',
      title: 'Mylapore Courtyard Home',
      location: 'Mylapore, Chennai',
      budget: '₹28–34L',
      year: '2025',
      rating: 5,
      viewCount: 2450,
      areaSqFt: 2250,
    },
    {
      id: 'project-08',
      imageSrc: '/illustrations/public-profile/project-04.jpg',
      propertyType: '4 BHK · Villa',
      title: 'ECR Garden Villa',
      location: 'Injambakkam, Chennai',
      budget: '₹48–56L',
      year: '2022',
      rating: 4.7,
      viewCount: 1520,
      areaSqFt: 3800,
    },
    {
      id: 'project-09',
      imageSrc: '/illustrations/public-profile/project-05.jpg',
      propertyType: '3 BHK · Apartment',
      title: 'Besant Nagar Residence',
      location: 'Besant Nagar, Chennai',
      budget: '₹30–36L',
      year: '2025',
      rating: 4.9,
      viewCount: 1980,
      areaSqFt: 2100,
    },
  ],
  reviews: [
    {
      id: 'review-01',
      author: 'Rahul S.',
      date: 'Feb 2026',
      body: 'Anika and her team understood what we wanted before we could properly explain it. The home feels calm, practical and completely ours.',
      rating: 4.5,
      imageSrc: '/illustrations/public-profile/reviewer.png',
    },
    {
      id: 'review-02',
      author: 'Meera & Karthik',
      date: 'Jan 2026',
      body: 'Every material choice was explained clearly, and the final result feels even better than the renders. The team was thoughtful throughout.',
      rating: 5,
      imageSrc: '/illustrations/public-profile/reviewer.png',
    },
  ],
} satisfies PublicDesignerProfileViewModel;
