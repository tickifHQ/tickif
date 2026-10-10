'use client';

import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { loadProjectEngagement, subscribeProjectEngagement } from '@/lib/project-engagement';

export function ProjectViewCount({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<{ projectId: string; count: number | null } | null>(null);
  useEffect(() => {
    let generation = 0;
    let disposed = false;
    async function load() {
      const request = ++generation;
      try {
        const value = await loadProjectEngagement(projectId);
        if (!disposed && request === generation) setResult({ projectId, count: value.viewCount });
      } catch {
        if (!disposed && request === generation) setResult({ projectId, count: null });
      }
    }
    const unsubscribe = subscribeProjectEngagement(projectId, () => void load());
    void load();
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [projectId]);

  const current = result?.projectId === projectId ? result : null;
  const label = !current
    ? 'Loading project views'
    : current.count === null
      ? 'Project views unavailable'
      : `${current.count.toLocaleString('en-IN')} project ${current.count === 1 ? 'view' : 'views'}`;
  return (
    <span
      role="img"
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-1.5 px-2 text-sm text-muted-foreground"
      title={label}
    >
      <Eye aria-hidden className="size-4" />
      <span aria-hidden>
        {!current ? '…' : current.count === null ? '—' : current.count.toLocaleString('en-IN')}
      </span>
    </span>
  );
}
