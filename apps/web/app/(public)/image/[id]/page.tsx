import { notFound } from 'next/navigation';
import {
  feedProjectsResponseSchema,
  publicImageDetailResponseSchema,
  publicProjectBySlugResponseSchema,
  type FeedProject,
  type PublicImageDetailResponse,
} from '@repo/contracts';
import { ImageDetailView } from '@/components/image-detail-view';
import { api } from '@/lib/api';

/**
 * The enquiry CTA needs the owning designer's profile id, which the image
 * detail projection (a feed card) doesn't carry. The public by-slug route
 * exposes it and needs no session, so resolve it from there. A failure here
 * only disables the enquiry action, so it must not fail the page.
 */
async function fetchDesignerProfileId(slug: string): Promise<string | null> {
  try {
    const response = await api.api.projects.slug[':slug'].$get({ param: { slug } });
    if (!response.ok) return null;

    const parsed = publicProjectBySlugResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.designer.id : null;
  } catch {
    return null;
  }
}

async function fetchImageDetail(imageId: string): Promise<PublicImageDetailResponse | null> {
  const response = await api.api.projects.images[':imageId'].$get({
    param: { imageId },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Could not load image detail for ${imageId}.`);
  }

  const payload = await response.json();
  const parsed = publicImageDetailResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid image detail response for ${imageId}.`);
  }

  return parsed.data;
}

async function fetchFeedProjects(): Promise<FeedProject[]> {
  const response = await api.api.projects.feed.$get({
    query: { limit: '30' },
  });

  if (!response.ok) return [];

  const payload = await response.json();
  const parsed = feedProjectsResponseSchema.safeParse(payload);
  if (!parsed.success) return [];

  return parsed.data.projects;
}

export default async function ImageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [imageDetail, feedProjects] = await Promise.all([
    fetchImageDetail(id),
    fetchFeedProjects(),
  ]);

  if (!imageDetail) {
    notFound();
  }

  const moreProjects = feedProjects.filter((project) => project.id !== imageDetail.project.id);
  const designerProfileId = await fetchDesignerProfileId(imageDetail.project.slug);

  return (
    <ImageDetailView
      project={imageDetail.project}
      gallery={imageDetail.images}
      moreProjects={moreProjects}
      activeImageId={imageDetail.activeImageId}
      designerProfileId={designerProfileId}
    />
  );
}
