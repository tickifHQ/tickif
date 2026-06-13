import sharp from 'sharp';

const GRID = 32;
const LOW = 8;

const ALPHA = (k: number): number => (k === 0 ? Math.sqrt(1 / GRID) : Math.sqrt(2 / GRID));

const COS: number[][] = Array.from({ length: LOW }, (_, k) =>
  Array.from({ length: GRID }, (_, x) => Math.cos(((2 * x + 1) * k * Math.PI) / (2 * GRID))),
);

/**
 * 64-bit perceptual hash (DCT-based pHash) as 16 hex chars. Downscales to a
 * 32×32 grayscale grid, keeps the 8×8 low-frequency DCT block, and sets each bit
 * from the block's median — robust to resize/recompress, sensitive to content.
 */
export async function computePhash(input: Buffer): Promise<string> {
  const pixels = await sharp(input)
    .removeAlpha()
    .grayscale()
    .resize(GRID, GRID, { fit: 'fill' })
    .raw()
    .toBuffer();

  const coeffs: number[] = [];
  for (let u = 0; u < LOW; u++) {
    for (let v = 0; v < LOW; v++) {
      let sum = 0;
      for (let x = 0; x < GRID; x++) {
        let rowSum = 0;
        for (let y = 0; y < GRID; y++) {
          rowSum += pixels[x * GRID + y]! * COS[v]![y]!;
        }
        sum += COS[u]![x]! * rowSum;
      }
      coeffs.push(ALPHA(u) * ALPHA(v) * sum);
    }
  }

  // Median of all but the DC term, which dominates and carries no detail.
  const sorted = coeffs.slice(1).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;

  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    let nibble = 0;
    for (let b = 0; b < 4; b++) {
      if (coeffs[i + b]! > median) nibble |= 1 << (3 - b);
    }
    hex += nibble.toString(16);
  }
  return hex;
}

/** Bit differences between two equal-length hex hashes. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new Error(`hammingDistance: length mismatch (${a.length} vs ${b.length})`);
  }
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (x) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}

export type PhashCandidate = { imageId: string; phash: string };

/** Closest candidate within `threshold`, or null. Candidate set is bounded per-project (E-110). */
export function findNearestDuplicate(
  phash: string,
  candidates: readonly PhashCandidate[],
  threshold: number,
): { imageId: string; distance: number } | null {
  let best: { imageId: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = hammingDistance(phash, candidate.phash);
    if (distance <= threshold && (!best || distance < best.distance)) {
      best = { imageId: candidate.imageId, distance };
    }
  }
  return best;
}
