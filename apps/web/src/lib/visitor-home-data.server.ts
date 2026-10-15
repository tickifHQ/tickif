import 'server-only';
import { headers } from 'next/headers';
import {
  listEnquiriesResponseSchema,
  listSavedProjectsResponseSchema,
  similarProjectsResponseSchema,
  enquiryCountsSchema,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { handleApiResponse } from '@/lib/api-response';

export async function getVisitorEnquiryCounts() {
  const response = await api.api.enquiries.counts.$get(
    {},
    {
      init: {
        headers: { cookie: (await headers()).get('cookie') ?? '' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    },
  );
  return handleApiResponse(response, enquiryCountsSchema, 'Could not load enquiry counts.');
}

/** Account-scoped, uncached reads. A partial failure never erases the other region. */
export async function getVisitorHomeActivity() {
  const options = {
    init: {
      headers: { cookie: (await headers()).get('cookie') ?? '' },
      cache: 'no-store' as const,
    },
  };
  const [saved, enquiries] = await Promise.allSettled([
    api.api['saved-projects']
      .$get({ query: { page: 1, limit: 1 } }, options)
      .then((response) =>
        handleApiResponse(
          response,
          listSavedProjectsResponseSchema,
          'Could not load saved projects.',
        ),
      ),
    api.api.enquiries.mine
      .$get({ query: { status: 'all', page: 1, limit: 1 } }, options)
      .then((response) =>
        handleApiResponse(response, listEnquiriesResponseSchema, 'Could not load enquiries.'),
      ),
  ]);
  return {
    saved: saved.status === 'fulfilled' ? saved.value : null,
    enquiries: enquiries.status === 'fulfilled' ? enquiries.value : null,
  };
}

/** Existing published-only, rule-based similarity. No new recommendation engine. */
export async function getSavedProjectSuggestions(projectId: string) {
  const response = await api.api.discovery.similar[':id'].$get(
    { param: { id: projectId } },
    { init: { cache: 'no-store' } },
  );
  const result = await handleApiResponse(
    response,
    similarProjectsResponseSchema,
    'Could not load similar projects.',
  );
  const seen = new Set([projectId]);
  return result.projects.filter((project) => {
    if (seen.has(project.id)) return false;
    seen.add(project.id);
    return true;
  });
}
