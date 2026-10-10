import { projectEngagementResponseSchema, type ProjectEngagement } from '@repo/contracts';
import { api } from '@/lib/api';

type Waiter = { resolve: (value: ProjectEngagement) => void; reject: (reason: Error) => void };
let batch: Map<string, Waiter[]> | null = null;
const listeners = new Map<string, Set<() => void>>();

/** Batch mounted cards without retaining stale counts or personalized state. */
export function loadProjectEngagement(projectId: string): Promise<ProjectEngagement> {
  if (!batch) {
    batch = new Map();
    const pending = batch;
    queueMicrotask(() => {
      batch = null;
      const ids = [...pending.keys()];
      for (let offset = 0; offset < ids.length; offset += 48) {
        void flush(pending, ids.slice(offset, offset + 48));
      }
    });
  }
  const pending = batch;
  return new Promise((resolve, reject) => {
    const waiters = pending.get(projectId) ?? [];
    waiters.push({ resolve, reject });
    pending.set(projectId, waiters);
  });
}

async function flush(pending: Map<string, Waiter[]>, projectIds: string[]) {
  try {
    const response = await api.api.interactions.projects.$get({ query: { projectIds } });
    if (!response.ok) throw new Error('Project counts unavailable');
    const parsed = projectEngagementResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('Project counts unavailable');
    const counts = new Map(parsed.data.projects.map((item) => [item.projectId, item]));
    for (const id of projectIds) {
      const value = counts.get(id);
      for (const waiter of pending.get(id) ?? []) {
        if (value) waiter.resolve(value);
        else waiter.reject(new Error('Project unavailable'));
      }
    }
  } catch {
    for (const id of projectIds)
      for (const waiter of pending.get(id) ?? [])
        waiter.reject(new Error('Project counts unavailable'));
  }
}

export function subscribeProjectEngagement(projectId: string, listener: () => void) {
  const subscribers = listeners.get(projectId) ?? new Set<() => void>();
  subscribers.add(listener);
  listeners.set(projectId, subscribers);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) listeners.delete(projectId);
  };
}

export function refreshProjectEngagement(projectId: string) {
  for (const listener of listeners.get(projectId) ?? []) listener();
}
