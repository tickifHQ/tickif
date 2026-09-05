const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole display days left until the sweep becomes eligible at the deadline. */
export function daysRemaining(
  startedAt: Date | null,
  windowDays: number,
  now: Date,
): number | null {
  if (!startedAt) return null;
  const deadline = startedAt.getTime() + windowDays * DAY_MS;
  const remainingMs = deadline - now.getTime();
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / DAY_MS);
}
