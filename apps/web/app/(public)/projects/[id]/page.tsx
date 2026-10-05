import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { PublicProjectPageResponse } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { PublicProjectOverview } from '@/components/public-project-overview';
import { fetchPublicProject, isUnavailableProject } from '@/lib/public-project-api';
import { publicMetadata, publicUrl } from '@/lib/social-metadata';

type ProjectDetailPageProps = { params: Promise<{ id: string }> };

function canonicalProjectUrl(projectId: string): string {
  return publicUrl(`/projects/${projectId}`);
}

async function resolveProject(id: string): Promise<PublicProjectPageResponse> {
  const project = await fetchPublicProject(id);
  if (!project) notFound();
  return project;
}

export async function generateMetadata({ params }: ProjectDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const project = await resolveProject(id);
  const canonicalUrl = canonicalProjectUrl(project.id);
  if (isUnavailableProject(project)) {
    return {
      title: `${project.title} is unavailable | Tickif`,
      description: `This project from ${project.designer.displayName} is currently unavailable.`,
      alternates: { canonical: canonicalUrl },
      robots: { index: false, follow: true },
    };
  }
  const description =
    project.description ?? `Explore ${project.title} by ${project.designer.displayName} on Tickif.`;

  return publicMetadata({
    title: project.title,
    description,
    path: `/projects/${project.id}`,
    imagePath: `/projects/${project.id}/social-card`,
    type: 'article',
  });
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = await params;
  const project = await resolveProject(id);
  const canonicalUrl = canonicalProjectUrl(project.id);

  if (isUnavailableProject(project)) {
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
