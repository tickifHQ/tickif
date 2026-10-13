import { projectsRepository } from './repository.js';
import { log } from '../../lib/logger.js';

/** Recheck current public verification once per page, including indexed search hits. */
export async function withPublicStudioVerification<T extends { id: string }>(items: T[]) {
  if (items.length === 0) return [];
  let states: Map<string, boolean>;
  try {
    states = await projectsRepository.findPublicStudioVerification(items.map((item) => item.id));
  } catch {
    // Fail closed: an outage must not preserve an old verification assertion.
    log.warn({ event: 'feed.studio_verification.unavailable' }, 'Studio verification unavailable');
    states = new Map();
  }
  return items.map((item) => ({ ...item, studioIsVerified: states.get(item.id) === true }));
}
