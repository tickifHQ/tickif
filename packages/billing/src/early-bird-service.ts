import {
  EARLY_BIRD_DEADLINE,
  earlyBirdEndsAt,
  type EarlyBirdStatus,
  type EarlyBirdTier,
  type EarlyBirdTrial,
} from '@repo/contracts';
import { earlyBirdRepository } from './early-bird-repository.js';

type Subscription = Awaited<ReturnType<typeof earlyBirdRepository.find>>;

export function activeEarlyBirdTrial(row: Subscription, now = new Date()): EarlyBirdTrial | null {
  if (
    !row?.earlyBirdStartedAt ||
    !row.earlyBirdEndsAt ||
    !row.earlyBirdTier ||
    row.earlyBirdTier === 'hobby' ||
    row.razorpaySubscriptionId ||
    row.subscriptionState !== 'active' ||
    row.planTier !== row.earlyBirdTier ||
    row.earlyBirdEndsAt <= now
  )
    return null;
  return {
    tier: row.earlyBirdTier,
    startedAt: row.earlyBirdStartedAt.toISOString(),
    endsAt: row.earlyBirdEndsAt.toISOString(),
  };
}

function eligible(row: Subscription, now: Date): boolean {
  return (
    now < new Date(EARLY_BIRD_DEADLINE) &&
    (!row ||
      (row.planTier === 'hobby' &&
        row.subscriptionState === 'active' &&
        !row.earlyBirdStartedAt &&
        !row.razorpaySubscriptionId &&
        !row.razorpayStatus &&
        !row.preLapseTier))
  );
}

export async function earlyBirdStatus(
  organizationId: string,
  now = new Date(),
): Promise<EarlyBirdStatus> {
  const [row, pending] = await Promise.all([
    earlyBirdRepository.find(organizationId),
    earlyBirdRepository.hasOpenOperation(organizationId),
  ]);
  return { eligible: !pending && eligible(row, now), trial: activeEarlyBirdTrial(row, now) };
}

export async function claimEarlyBird(
  organizationId: string,
  tier: EarlyBirdTier,
  now = new Date(),
): Promise<EarlyBirdTrial | null> {
  return earlyBirdRepository.locked(organizationId, async (repo) => {
    const row = await repo.find();
    const current = activeEarlyBirdTrial(row, now);
    if (current) return current.tier === tier ? current : null;
    if (!eligible(row, now)) return null;
    // Checkout reservations survive uncertain provider outcomes without a saved
    // provider ID. Check them under the same billing lock before granting access.
    if (await repo.hasOpenOperation()) return null;
    const end = earlyBirdEndsAt(now);
    await repo.grant(tier, now, end);
    return { tier, startedAt: now.toISOString(), endsAt: end.toISOString() };
  });
}

/** Shares the checkout/webhook lock; a paid activation can never be overwritten. */
export async function expireEarlyBird(organizationId: string, now = new Date()): Promise<boolean> {
  const candidate = await earlyBirdRepository.find(organizationId);
  if (
    !candidate?.earlyBirdEndsAt ||
    candidate.earlyBirdEndsAt > now ||
    candidate.razorpaySubscriptionId ||
    candidate.planTier === 'hobby'
  )
    return false;
  return earlyBirdRepository.locked(organizationId, async (repo) => {
    const row = await repo.find();
    if (
      !row?.earlyBirdEndsAt ||
      row.earlyBirdEndsAt > now ||
      row.razorpaySubscriptionId ||
      row.planTier === 'hobby'
    )
      return false;
    await repo.expire();
    return true;
  });
}
