export type ActiveMemberFreezeCandidate = {
  id: string;
  role: string;
  createdAt: Date;
};

/**
 * Select newest active seats for freezing while preserving exactly the oldest
 * owner. Callers must provide candidates ordered newest-first.
 */
export function selectMemberIdsToFreeze(
  activeMembersNewestFirst: readonly ActiveMemberFreezeCandidate[],
  activeLimit: number,
): string[] {
  if (activeLimit < 0) return [];
  const freezeCount = Math.max(0, activeMembersNewestFirst.length - activeLimit);
  const preservedOwnerId = [...activeMembersNewestFirst]
    .reverse()
    .find(({ role }) => role === 'owner')?.id;
  return activeMembersNewestFirst
    .filter(({ id }) => id !== preservedOwnerId)
    .slice(0, freezeCount)
    .map(({ id }) => id);
}
