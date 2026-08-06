import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  galleryResponseSchema,
  projectDetailResponseSchema,
  type GalleryImage,
  type ProjectDetailResponse,
} from '@repo/contracts';
import { api } from '@/lib/api';

async function fetchProject(id: string): Promise<ProjectDetailResponse | null> {
  const response = await api.api.projects[':id'].$get({
    param: { id },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Could not load project ${id}.`);
  }

  const payload = await response.json();
  const parsed = projectDetailResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid project response for ${id}.`);
  }

  return parsed.data;
}

async function fetchGallery(id: string): Promise<GalleryImage[]> {
  const response = await api.api.projects[':id'].gallery.$get({
    param: { id },
  });

  if (!response.ok) return [];

  const payload = await response.json();
  const parsed = galleryResponseSchema.safeParse(payload);
  if (!parsed.success) return [];

  return parsed.data.images;
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, gallery] = await Promise.all([fetchProject(id), fetchGallery(id)]);

  if (!project) {
    notFound();
  }

  const location = [project.localitySlug, project.citySlug].filter(Boolean).join(', ');
  const firstImage = gallery[0] ?? null;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl flex-col justify-center px-6 py-16 lg:px-10">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Project details
      </p>
      <h1 className="mt-4 font-display text-4xl tracking-tight md:text-5xl">{project.title}</h1>
      {location ? <p className="mt-3 text-base text-muted-foreground">{location}</p> : null}
      {project.description ? (
        <p className="mt-8 max-w-3xl text-base leading-7 text-muted-foreground">
          {project.description}
        </p>
      ) : (
        <p className="mt-8 max-w-3xl text-base leading-7 text-muted-foreground">
          Project details are coming soon. You can browse this project's images while the full
          project view is being prepared.
        </p>
      )}

      <div className="mt-10 grid gap-4 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground sm:grid-cols-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em]">Rooms</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{project.rooms.length}</p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em]">Images</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{gallery.length}</p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em]">Status</p>
          <p className="mt-2 text-2xl font-semibold capitalize text-foreground">
            {project.status.replace('_', ' ')}
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {firstImage ? (
          <Link
            href={`/image/${firstImage.id}`}
            className="rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open image detail
          </Link>
        ) : null}
        <Link
          href="/"
          className="rounded-xl border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Back to results
        </Link>
      </div>
    </main>
  );
}
