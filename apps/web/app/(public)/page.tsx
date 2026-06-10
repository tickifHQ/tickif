import type { ProjectResponse } from '@repo/contracts';
import { api } from '@/lib/api';
import { ProjectCard } from '@/components/project-card';
import { Container } from '@/components/container';

export const dynamic = 'force-dynamic';

async function getProjects(): Promise<{ items: ProjectResponse[]; total: number } | null> {
  try {
    // Fully typed call against the Hono app — params, response shape, and
    // status are all checked at compile time via hc<AppType>.
    const res = await api.api.projects.$get({ query: {} });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // API not running (e.g. during a static probe) — render the empty state.
    return null;
  }
}

export default async function HomePage() {
  const data = await getProjects();

  return (
    <Container className="py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Tickif</h1>
      <p className="mt-2 text-muted-foreground">
        Discover real interior design projects across India.
      </p>

      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Published projects {data ? `(${data.total})` : ''}
        </h2>

        {data === null ? (
          <p className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground">
            Could not reach the API. Start it with <code>pnpm dev</code> and ensure the database
            is migrated.
          </p>
        ) : data.items.length === 0 ? (
          <p className="mt-4 text-muted-foreground">No projects yet.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {data.items.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}
