import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import {
  publicProjectDetailResponseSchema,
  type PublicProjectDetailResponse,
} from '@repo/contracts';
import { PublicProjectOverview } from '@/components/public-project-overview';
import { api } from '@/lib/api';
import { env } from '@/env';

type ProjectDetailPageProps = { params: Promise<{ id: string }> };

async function fetchProject(id: string): Promise<PublicProjectDetailResponse | null> {
  const response = await api.api.projects.public[':id'].$get({
    param: { id },
  });

  if ([400, 404, 422].includes(response.status)) return null;
  if (!response.ok) {
    throw new Error(`Could not load project ${id}.`);
  }

  const payload = await response.json();
  const parsed = publicProjectDetailResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid project response for ${id}.`);
  }

  return parsed.data;
}

const getProject = cache(fetchProject);

function canonicalProjectUrl(projectId: string): string {
  return new URL(`/projects/${projectId}`, env.NEXT_PUBLIC_WEB_URL).toString();
}

async function resolveProject(id: string): Promise<PublicProjectDetailResponse> {
  const project = await getProject(id);
  if (!project) notFound();
  return project;
}

export async function generateMetadata({ params }: ProjectDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const project = await resolveProject(id);
  const canonicalUrl = canonicalProjectUrl(project.id);
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

  return <PublicProjectOverview project={project} canonicalUrl={canonicalUrl} />;
}
