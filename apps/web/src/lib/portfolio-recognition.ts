import type { PortfolioBadge } from '@repo/contracts';

// Eligibility stays in the API; editor and public page share presentation assets.
// New on Tickif uses the neutral laurel until dedicated artwork is available.
export const portfolioRecognitionArtwork = {
  verified: '/ui/recognition/recognition-verified.svg',
  new: '/ui/recognition/recognition-established.svg',
  'top-performer': '/ui/recognition/recognition-top-performer.svg',
  established: '/ui/recognition/recognition-established.svg',
  'projects-published': '/ui/recognition/recognition-projects-published.svg',
} satisfies Record<PortfolioBadge, string>;
