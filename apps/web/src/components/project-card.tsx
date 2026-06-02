import type { ProjectResponse } from '@repo/contracts';

/** Presentational card for a single project. Pure — easy to unit-test. */
export function ProjectCard({ project }: { project: ProjectResponse }) {
  return (
    <li className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="font-medium">{project.title}</div>
      <div className="mt-1 text-sm text-neutral-500">
        {project.citySlug ?? 'unknown city'} · {project.status}
      </div>
    </li>
  );
}
