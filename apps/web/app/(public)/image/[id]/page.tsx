import { notFound } from 'next/navigation';
import {
  publicImageDetailResponseSchema,
  publicProjectBySlugResponseSchema,
  similarProjectsResponseSchema,
  type FeedProject,
  type PublicImageDetailResponse,
} from '@repo/contracts';
import { ImageDetailView } from '@/components/image-detail-view';
import { api } from '@/lib/api';
import { getServerSession } from '@/lib/auth-guard';
import { env } from '@/env';

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

  const [similarProjects, designerProfileId] = await Promise.all([
    fetchSimilarProjects(imageDetail.project.id),
    fetchDesignerProfileId(imageDetail.project.slug),
  ]);

  return (
    <ImageDetailView
      project={imageDetail.project}
      gallery={imageDetail.images}
      designer={imageDetail.designer}
      narrative={imageDetail.narrative}
      similarProjects={similarProjects}
      activeImageId={imageDetail.activeImageId}
      designerProfileId={designerProfileId}
      isAuthenticated={!!session}
    />
  );
}
