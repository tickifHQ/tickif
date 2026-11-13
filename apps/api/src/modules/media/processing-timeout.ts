/** A processing row untouched this long belongs to an abandoned upload or a lost job. */
export const PROCESSING_IMAGE_TIMEOUT_MS = 30 * 60_000;

export function isAbandonedProcessingImage(image: { status: string; updatedAt: Date }): boolean {
  return (
    image.status === 'processing' &&
    image.updatedAt.getTime() < Date.now() - PROCESSING_IMAGE_TIMEOUT_MS
  );
}
