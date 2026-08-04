import { notFound } from 'next/navigation';
import type { FeedProject, FeedProjectsResponse, GalleryImage, GalleryResponse } from '@repo/contracts';
import { ProjectDetailView } from '@/components/project-detail-view';
import { env } from '@/env';

const BASE_URL = env.NEXT_PUBLIC_API_URL;

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch gallery + feed + project detail in parallel
  const [galleryRes, feedRes, detailRes] = await Promise.all([
    fetch(`${BASE_URL}/api/projects/${id}/gallery`, { cache: 'no-store' }).catch(() => null),
    fetch(`${BASE_URL}/api/projects/feed?limit=30`, { cache: 'no-store' }).catch(() => null),
    fetch(`${BASE_URL}/api/projects/${id}`, { cache: 'no-store' }).catch(() => null),
  ]);

  // Gallery is required — if we can't load it, 404
  if (!galleryRes || !galleryRes.ok) {
    notFound();
  }

  const galleryData: GalleryResponse = await galleryRes.json();
  const gallery: GalleryImage[] = galleryData.images ?? [];

  // Parse feed
  let feedProjects: FeedProject[] = [];
  if (feedRes && feedRes.ok) {
    const feedData: FeedProjectsResponse = await feedRes.json();
    feedProjects = feedData.projects ?? [];
  }

  // Get designer profile ID from project detail
  let designerProfileId: string | null = null;
  if (detailRes && detailRes.ok) {
    const detailData = await detailRes.json();
    designerProfileId = detailData?.designerId ?? null;
  }

  // Find this project's metadata from the feed
  const project = feedProjects.find((p) => p.id === id);

  // If we can't find the project in the feed, build a minimal placeholder
  const projectData: FeedProject = project ?? {
    id,
    slug: id,
    title: 'Project',
    studio: '',
    city: null,
    locality: null,
    rating: 0,
    reviewCount: 0,
    budget: null,
    tags: [],
    coverImageUrl: gallery[0]?.url ?? null,
    imageWidth: gallery[0]?.width ?? null,
    imageHeight: gallery[0]?.height ?? null,
  };

  // "More like this" = feed minus current project
  const moreProjects = feedProjects.filter((p) => p.id !== id);

  return (
    <ProjectDetailView
      project={projectData}
      gallery={gallery}
      moreProjects={moreProjects}
      designerProfileId={designerProfileId}
    />
  );
}
