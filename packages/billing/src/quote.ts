/** Integer paise; use the paid cycle's actual duration, never a nominal 30-day month. */
export function upgradeAmount(
  sourceAmount: number,
  targetAmount: number,
  start: number,
  end: number,
  quotedAt: number,
) {
  if (
    ![sourceAmount, targetAmount, start, end, quotedAt].every(Number.isSafeInteger) ||
    sourceAmount < 0 ||
    targetAmount < 0 ||
    end <= start ||
    quotedAt < start ||
    quotedAt >= end
  ) {
    throw new Error('Invalid paid billing period');
  }
  return Number(
    (BigInt(Math.max(0, targetAmount - sourceAmount)) * BigInt(end - quotedAt)) /
      BigInt(end - start),
  );
}
