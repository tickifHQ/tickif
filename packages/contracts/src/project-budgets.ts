export const projectBudgetBands = [
  { slug: 'budget', label: 'Under ₹5L', min: 0, max: 500000 },
  { slug: '5l-10l', label: '₹5L - ₹10L', min: 500001, max: 1000000 },
  { slug: '10l-20l', label: '₹10L - ₹20L', min: 1000001, max: 2000000 },
  { slug: '20l-30l', label: '₹20L - ₹30L', min: 2000001, max: 3000000 },
  { slug: '30l-40l', label: '₹30L - ₹40L', min: 3000001, max: 4000000 },
  { slug: '40l-50l', label: '₹40L - ₹50L', min: 4000001, max: 5000000 },
  { slug: '50l-1cr', label: '₹50L - ₹1Cr', min: 5000001, max: 10000000 },
  { slug: '1cr-plus', label: '₹1Cr+', min: 10000001, max: null },
];

// These ranges remain valid for saved projects, but are no longer offered for new selections.
export const legacyProjectBudgetBands = [
  { slug: 'moderate', label: '₹5L - ₹15L', min: 500001, max: 1500000 },
  { slug: 'upscale', label: '₹15L - ₹35L', min: 1500001, max: 3500000 },
  { slug: 'luxury', label: '₹35L+', min: 3500001, max: null },
];
