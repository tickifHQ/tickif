import { searchProjectsResponseSchema } from '@repo/contracts';
import { api } from '@/lib/api';
import { fetchDesignerSearch } from '@/lib/designer-discovery-api';

/** An unavailable search index must not become a fabricated marketing count. */
export async function fetchLandingCommunity() {
  const [projects, designers] = await Promise.allSettled([
    (async () => {
      const response = await api.api.search.$get(
        { query: { q: '*', page: 1, limit: 1 } },
        { init: { cache: 'no-store' } },
      );
      if (!response.ok) throw new Error('Project count unavailable');
      return searchProjectsResponseSchema.parse(await response.json()).estimatedTotalHits;
    })(),
    fetchDesignerSearch({ q: '*', sort: 'relevance', page: 1, limit: 4 }),
  ]);
  return {
    projectCount: projects.status === 'fulfilled' ? projects.value : null,
    designers: designers.status === 'fulfilled' ? designers.value : null,
  };
}

export type LandingCommunity = Awaited<ReturnType<typeof fetchLandingCommunity>>;
