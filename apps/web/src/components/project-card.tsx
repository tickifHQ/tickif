import type { ProjectResponse } from '@repo/contracts';

/** Presentational card for a single project. Pure — easy to unit-test. */
export function ProjectCard({ project }: { project: ProjectResponse }) {
  return (
    <li className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      <div className="font-medium">{project.title}</div>
      <div className="mt-1 text-sm text-muted-foreground">
        {project.citySlug ?? 'unknown city'} · {project.status}
      </div>
    </li>
  );
}
