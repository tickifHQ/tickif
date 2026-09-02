import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import {
  publicProjectPageResponseSchema,
  type PublicProjectPageResponse,
  type PublicProjectUnavailableResponse,
} from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { PublicProjectOverview } from '@/components/public-project-overview';
import { api } from '@/lib/api';
import { env } from '@/env';

type ProjectDetailPageProps = { params: Promise<{ id: string }> };

async function fetchProject(id: string): Promise<PublicProjectPageResponse | null> {
  const response = await api.api.projects.public[':id'].$get({
    param: { id },
  });

  if ([400, 404, 410, 422].includes(response.status)) return null;
  if (!response.ok) {
    throw new Error(`Could not load project ${id}.`);
  }

  const payload = await response.json();
  const parsed = publicProjectPageResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid project response for ${id}.`);
  }

  return parsed.data;
}

const getProject = cache(fetchProject);

function canonicalProjectUrl(projectId: string): string {
  return new URL(`/projects/${projectId}`, env.NEXT_PUBLIC_WEB_URL).toString();
}

async function resolveProject(id: string): Promise<PublicProjectPageResponse> {
  const project = await getProject(id);
  if (!project) notFound();
  return project;
}

function isUnavailable(
  project: PublicProjectPageResponse,
): project is PublicProjectUnavailableResponse {
  return 'availability' in project && project.availability === 'unavailable';
}

export async function generateMetadata({ params }: ProjectDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const project = await resolveProject(id);
  const canonicalUrl = canonicalProjectUrl(project.id);
  if (isUnavailable(project)) {
    return {
      title: `${project.title} is unavailable | Tickif`,
      description: `This project from ${project.designer.displayName} is currently unavailable.`,
      alternates: { canonical: canonicalUrl },
      robots: { index: false, follow: true },
    };
  }
  const description =
    project.description ?? `Explore ${project.title} by ${project.designer.displayName} on Tickif.`;

  return {
    title: `${project.title} | Tickif`,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: 'article',
      title: project.title,
      description,
      url: canonicalUrl,
    },
  };
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = await params;
  const project = await resolveProject(id);
  const canonicalUrl = canonicalProjectUrl(project.id);

  if (isUnavailable(project)) {
    const profileHref = project.designer.slug ? `/d/${project.designer.slug}` : '/';
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Project unavailable
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{project.title}</h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
          This project is no longer publicly available. You can still explore work from{' '}
          {project.designer.displayName}.
        </p>
        <Button asChild className="mt-8">
          <Link href={profileHref}>View studio profile</Link>
        </Button>
      </section>
    );
  }

  return <PublicProjectOverview project={project} canonicalUrl={canonicalUrl} />;
}
