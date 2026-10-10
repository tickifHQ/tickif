import { headers } from 'next/headers';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  listSavedProjectsQuerySchema,
  listSavedProjectsResponseSchema,
  PLATFORM_ROLE,
} from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Container } from '@/components/container';
import { PublicHeader } from '@/components/public-header';
import { PublicFooter } from '@/components/public-footer';
import { ShowcaseCard } from '@/components/showcase-card';
import { SavedProjectsSync } from '@/components/saved-projects-sync';
import { UrlListPagination } from '@/components/list-pagination';
import { requireAuth } from '@/lib/auth-guard';
import { api } from '@/lib/api';

export const metadata = { title: 'Saved projects · Tickif' };

export default async function SavedProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const session = await requireAuth();
  if (session.user.role !== PLATFORM_ROLE.VISITOR && session.user.role !== PLATFORM_ROLE.DESIGNER)
    redirect('/unauthorized');
  const parsed = listSavedProjectsQuerySchema.safeParse(await searchParams);
  if (!parsed.success) redirect('/saved-projects');
  const query = parsed.data;
  const cookie = (await headers()).get('cookie') ?? '';
  const response = await api.api['saved-projects'].$get(
    { query },
    { headers: { cookie }, init: { cache: 'no-store' } },
  );
  if (response.status === 401) redirect('/login?callbackURL=%2Fsaved-projects');
  if (response.status === 403) redirect('/unauthorized');
  if (!response.ok) throw new Error('Could not load saved projects.');
  const data = listSavedProjectsResponseSchema.safeParse(await response.json());
  if (!data.success) throw new Error('Could not load saved projects.');
  const { projects, page, limit, total, totalPages } = data.data;
  if (page > Math.max(totalPages, 1))
    redirect(`/saved-projects?page=${Math.max(totalPages, 1)}&limit=${limit}`);

  return (
    <>
      <SavedProjectsSync userId={session.user.id} />
      <PublicHeader isAuthenticated userRole={session.user.role} />
      <Container as="main" className="min-h-screen py-10">
        <h1 className="text-3xl font-medium">Saved projects</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Revisit the projects you saved for inspiration.
        </p>
        {projects.length ? (
          <>
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {projects.map((project) => (
                <ShowcaseCard key={project.id} project={project} presentation="landing" />
              ))}
            </div>
            <Suspense>
              <UrlListPagination
                page={page}
                limit={limit}
                total={total}
                totalPages={totalPages}
                showPageSize={false}
                itemName="saved project"
              />
            </Suspense>
          </>
        ) : (
          <div className="mt-8 rounded-card border bg-card p-8">
            <h2 className="text-lg">No saved projects to show</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Save a project while exploring to find it here. Only currently public projects are
              shown.
            </p>
            <Button asChild className="mt-5">
              <Link href="/">Explore projects</Link>
            </Button>
          </div>
        )}
      </Container>
      <PublicFooter />
    </>
  );
}
