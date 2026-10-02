import { cache } from 'react';
import {
  publicProjectPageResponseSchema,
  publicImageDetailResponseSchema,
  type PublicProjectPageResponse,
  type PublicProjectUnavailableResponse,
} from '@repo/contracts';
import { api } from '@/lib/api';

/** Public API gates are authoritative on every read, including social images. */
export const fetchPublicProject = cache(async (id: string) => {
  const response = await api.api.projects.public[':id'].$get(
    { param: { id } },
    { init: { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } } },
  );
  if ([400, 404, 410, 422].includes(response.status)) return null;
  if (!response.ok) throw new Error(`Could not load project ${id}.`);
  const parsed = publicProjectPageResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error(`Invalid project response for ${id}.`);
  return parsed.data;
});

export function isUnavailableProject(
  project: PublicProjectPageResponse,
): project is PublicProjectUnavailableResponse {
  return 'availability' in project && project.availability === 'unavailable';
}

export const fetchPublicImage = cache(async (imageId: string) => {
  const response = await api.api.projects.images[':imageId'].$get(
    { param: { imageId } },
    { init: { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } } },
  );
  if ([400, 404, 410, 422].includes(response.status)) return null;
  if (!response.ok) throw new Error(`Could not load image detail for ${imageId}.`);
  const parsed = publicImageDetailResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error(`Invalid image detail response for ${imageId}.`);
  return parsed.data;
});
