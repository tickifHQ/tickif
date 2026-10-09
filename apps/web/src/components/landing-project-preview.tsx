'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { FeedProject } from '@repo/contracts';

const PreviewContext = createContext<{
  projects: FeedProject[];
  setProjects: (projects: FeedProject[]) => void;
} | null>(null);

/** Share server-fetched homepage photos with the sibling sign-in prompt. */
export function LandingProjectPreviewProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<FeedProject[]>([]);
  const value = useMemo(() => ({ projects, setProjects }), [projects]);
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function LandingProjectPreviewData({ projects }: { projects: FeedProject[] }) {
  const setProjects = useContext(PreviewContext)?.setProjects;
  useEffect(() => {
    setProjects?.(projects.filter((project) => project.coverImageUrl).slice(0, 4));
    return () => setProjects?.([]);
  }, [projects, setProjects]);
  return null;
}

export function useLandingProjectPreviews() {
  return useContext(PreviewContext)?.projects;
}
