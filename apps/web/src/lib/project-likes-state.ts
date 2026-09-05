import { projectLikesStateResponseSchema, type ProjectLikeState } from '@repo/contracts';
import { api } from '@/lib/api';

type Waiter = { resolve: (state: ProjectLikeState) => void; reject: (error: Error) => void };
type Batch = Map<string, Waiter[]>;
const batches = new Map<string, Batch>();
const subscribers = new Map<string, Set<(state: ProjectLikeState) => void>>();
const latestMutations = new Map<string, symbol>();
const subscriptionKey = (identity: string, projectId: string) =>
  JSON.stringify([identity, projectId]);

/** Only in-flight work is shared, never cached personalized responses. */
export function loadProjectLikeState(
  identity: string,
  projectId: string,
): Promise<ProjectLikeState> {
  let batch = batches.get(identity);
  if (!batch) {
    batch = new Map();
    batches.set(identity, batch);
    const pending = batch;
    queueMicrotask(() => {
      batches.delete(identity);
      const ids = [...pending.keys()];
      for (let offset = 0; offset < ids.length; offset += 48) {
        void flushBatch(pending, ids.slice(offset, offset + 48));
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

async function flushBatch(batch: Batch, projectIds: string[]) {
  try {
    const response = await api.api['project-likes'].state.$get({ query: { projectIds } });
    if (!response.ok) throw new Error('Could not load likes.');
    const parsed = projectLikesStateResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('Could not load likes.');
    const states = new Map(parsed.data.projects.map((state) => [state.projectId, state]));
    for (const projectId of projectIds) {
      const state = states.get(projectId);
      for (const waiter of batch.get(projectId) ?? []) {
        if (state) waiter.resolve(state);
        else waiter.reject(new Error('This project is no longer available.'));
      }
    }
  } catch {
    for (const projectId of projectIds) {
      for (const waiter of batch.get(projectId) ?? [])
        waiter.reject(new Error('Could not load likes. Please try again.'));
    }
  }
}

export function subscribeProjectLikeState(
  identity: string,
  projectId: string,
  listener: (state: ProjectLikeState) => void,
) {
  const key = subscriptionKey(identity, projectId);
  const listeners = subscribers.get(key) ?? new Set<(state: ProjectLikeState) => void>();
  listeners.add(listener);
  subscribers.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) subscribers.delete(key);
  };
}

export function publishProjectLikeState(identity: string, state: ProjectLikeState) {
  for (const listener of subscribers.get(subscriptionKey(identity, state.projectId)) ?? [])
    listener(state);
}

/** Orders writes shared by duplicate controls so a late response cannot restore stale state. */
export function beginProjectLikeMutation(identity: string, projectId: string): symbol {
  const key = subscriptionKey(identity, projectId);
  const token = Symbol();
  latestMutations.set(key, token);
  return token;
}

export function isLatestProjectLikeMutation(
  identity: string,
  projectId: string,
  token: symbol,
): boolean {
  return latestMutations.get(subscriptionKey(identity, projectId)) === token;
}

export function finishProjectLikeMutation(
  identity: string,
  projectId: string,
  token: symbol,
): void {
  const key = subscriptionKey(identity, projectId);
  if (latestMutations.get(key) === token) latestMutations.delete(key);
}
