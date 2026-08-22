import { notFound } from 'next/navigation';
import {
  publicImageDetailResponseSchema,
  similarProjectsResponseSchema,
  type FeedProject,
  type PublicImageDetailResponse,
} from '@repo/contracts';
import { ImageDetailView } from '@/components/image-detail-view';
import { api } from '@/lib/api';
import { getServerSession } from '@/lib/auth-guard';
import { env } from '@/env';

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

async function fetchSimilarProjects(projectId: string): Promise<FeedProject[]> {
  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_API_URL}/api/discovery/similar/${projectId}`,
      { cache: 'no-store' },
    );
    if (!response.ok) return [];
    const payload = await response.json();
    const parsed = similarProjectsResponseSchema.safeParse(payload);
    return parsed.success ? parsed.data.projects : [];
  } catch {
    return [];
  }
}

export default async function ImageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [imageDetail, session] = await Promise.all([
    fetchImageDetail(id),
    getServerSession(),
  ]);

  if (!imageDetail) {
    notFound();
  }

  // Use designer.id directly from the image-detail response (blocking #3 fix).
  // No redundant by-slug fetch needed — both come from buildPublicProjectDetail().
  const designerProfileId = imageDetail.designer.id;

  // Similar projects with fallback to recommendations (blocking #4 fix).
  // /api/discovery/similar requires exact match on all 4 nullable taxonomy slugs,
  // so many projects return empty. Fall back to the already-fetched recommendations.
  const similarProjects = await fetchSimilarProjects(imageDetail.project.id);
  const moreProjects: FeedProject[] =
    similarProjects.length > 0
      ? similarProjects
      : (imageDetail.recommendations.nearby.length > 0
          ? imageDetail.recommendations.nearby
          : imageDetail.recommendations.sameBudgetDifferentStyle
        ).slice(0, 8);

  return (
    <ImageDetailView
      project={imageDetail.project}
      gallery={imageDetail.images}
      designer={imageDetail.designer}
      narrative={imageDetail.narrative}
      moreProjects={moreProjects}
      activeImageId={imageDetail.activeImageId}
      designerProfileId={designerProfileId}
      isAuthenticated={!!session}
    />
  );
}
