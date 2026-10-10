'use client';

import { useEffect, useRef } from 'react';
import { z } from 'zod';
import { recordViewEventResponseSchema } from '@repo/contracts';
import { api } from '@/lib/api';
import { refreshProjectEngagement } from '@/lib/project-engagement';

const visitorIdSchema = z.uuid();
const storageKey = 'tickif.anonymousId';

function getAnonymousId() {
  try {
    const existing = visitorIdSchema.safeParse(window.localStorage.getItem(storageKey));
    if (existing.success) return existing.data;
    const id = crypto.randomUUID();
    window.localStorage.setItem(storageKey, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Page visits only: card renders, server metadata and prefetches never call this. */
export function ProjectViewTracker({
  projectId,
  isAuthenticated,
}: {
  projectId: string;
  isAuthenticated: boolean;
}) {
  const visit = useRef<{ projectId: string; eventKey: string } | null>(null);
  useEffect(() => {
    if (!isAuthenticated) {
      visit.current = null;
      return;
    }
    if (visit.current?.projectId !== projectId)
      visit.current = { projectId, eventKey: crypto.randomUUID() };
    const eventKey = visit.current.eventKey;
    let sent = false;
    async function record() {
      if (sent || document.visibilityState === 'hidden') return;
      sent = true;
      try {
        const response = await api.api.interactions.views.$post({
          json: {
            type: 'project_view',
            projectId,
            eventKey,
            anonymousId: getAnonymousId(),
          },
        });
        if (!response.ok) return;
        const parsed = recordViewEventResponseSchema.safeParse(await response.json());
        if (parsed.success) refreshProjectEngagement(projectId);
      } catch {
        // Analytics must never block navigation or saving a project.
      }
    }
    const onVisible = () => void record();
    document.addEventListener('visibilitychange', onVisible);
    void record();
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [projectId, isAuthenticated]);
  return null;
}
