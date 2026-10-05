import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { similarProjectsResponseSchema, type FeedProject } from '@repo/contracts';
import { ImageDetailView } from '@/components/image-detail-view';
import { getServerSession } from '@/lib/auth-guard';
import { env } from '@/env';
import { fetchPublicImage } from '@/lib/public-project-api';
import { publicMetadata } from '@/lib/social-metadata';

async function fetchSimilarProjects(projectId: string): Promise<FeedProject[]> {
  try {
    const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/discovery/similar/${projectId}`, {
      cache: 'no-store',
    });
    if (!response.ok) return [];
    const payload = await response.json();
    const parsed = similarProjectsResponseSchema.safeParse(payload);
    return parsed.success ? parsed.data.projects : [];
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await fetchPublicImage(id);
  if (!detail) notFound();
  const title = detail.activeImage.roomName
    ? `${detail.activeImage.roomName} — ${detail.project.title}`
    : detail.project.title;
  return publicMetadata({
    title,
    description:
      detail.project.description ??
      `Explore ${detail.project.title} by ${detail.designer.displayName} on Tickif.`,
    path: `/image/${detail.activeImageId}`,
    imagePath: `/image/${detail.activeImageId}/social-card`,
    type: 'article',
  });
}

export default async function ImageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [imageDetail, session] = await Promise.all([fetchPublicImage(id), getServerSession()]);

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
