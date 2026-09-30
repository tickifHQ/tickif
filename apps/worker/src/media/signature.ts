import { createHash } from 'node:crypto';
import sharp from 'sharp';

const BLOCK_SIZE = 8;
// Keep pixel changes restrained while retaining recovery through both encoders.
const QUANTUM = 28;
const MARKER = Buffer.from('TK');
const SIGNATURE_BYTES = 12;
const SIGNATURE_BITS = SIGNATURE_BYTES * 8;
// Repeat each bit across the image without processing every block of large derivatives.
const MAX_BLOCKS = SIGNATURE_BITS * 6;
const MAX_IDENTIFY_PIXELS = 40_000_000;

// One low-frequency cosine coefficient survives WebP/AVIF encoding on ordinary photos.
const basis = Float64Array.from({ length: BLOCK_SIZE * BLOCK_SIZE }, (_, index) => {
  const x = index % BLOCK_SIZE;
  const y = Math.floor(index / BLOCK_SIZE);
  return 0.25 * Math.cos(((2 * x + 1) * Math.PI) / 16) * Math.cos(((2 * y + 1) * 2 * Math.PI) / 16);
});

/** Stable 64-bit token for matching a recovered image against a stored image ID. */
export function signatureToken(imageId: string): string {
  return createHash('sha256').update(imageId).digest('hex').slice(0, 16);
}

function signatureBytes(imageId: string): Buffer {
  const token = Buffer.from(signatureToken(imageId), 'hex');
  const checksum = createHash('sha256').update(token).digest().subarray(0, 2);
  return Buffer.concat([MARKER, token, checksum]);
}

function blockCoefficient(
  pixels: Buffer,
  width: number,
  channels: number,
  blockX: number,
  blockY: number,
): number {
  const colorChannels = Math.min(channels, 3);
  let coefficient = 0;
  for (let y = 0; y < BLOCK_SIZE; y++) {
    for (let x = 0; x < BLOCK_SIZE; x++) {
      const offset = ((blockY * BLOCK_SIZE + y) * width + blockX * BLOCK_SIZE + x) * channels;
      let brightness = 0;
      for (let channel = 0; channel < colorChannels; channel++) {
        brightness += pixels[offset + channel]!;
      }
      coefficient += (brightness / colorChannels) * basis[y * BLOCK_SIZE + x]!;
    }
  }
  return coefficient;
}

function forEachSignatureBlock(
  width: number,
  height: number,
  visit: (x: number, y: number, index: number) => void,
) {
  const columns = Math.floor(width / BLOCK_SIZE);
  const rows = Math.floor(height / BLOCK_SIZE);
  const available = columns * rows;
  const selected = Math.min(available, MAX_BLOCKS);
  for (let slot = 0; slot < selected; slot++) {
    const block = Math.floor(((slot + 0.5) * available) / selected);
    visit(block % columns, Math.floor(block / columns), slot);
  }
  return selected;
}

/** Changes low-frequency image coefficients in place; no metadata or original bytes are exposed. */
export function embedImageSignature(
  pixels: Buffer,
  width: number,
  height: number,
  channels: number,
  imageId: string,
): boolean {
  if (Math.floor(width / BLOCK_SIZE) * Math.floor(height / BLOCK_SIZE) < SIGNATURE_BITS)
    return false;
  const payload = signatureBytes(imageId);
  const colorChannels = Math.min(channels, 3);
  forEachSignatureBlock(width, height, (blockX, blockY, index) => {
    const bitIndex = index % SIGNATURE_BITS;
    const bit = (payload[bitIndex >> 3]! >> (7 - (bitIndex & 7))) & 1;
    const coefficient = blockCoefficient(pixels, width, channels, blockX, blockY);
    const target = (Math.round((coefficient / QUANTUM - bit) / 2) * 2 + bit) * QUANTUM;
    const adjustment = target - coefficient;
    for (let y = 0; y < BLOCK_SIZE; y++) {
      for (let x = 0; x < BLOCK_SIZE; x++) {
        const offset = ((blockY * BLOCK_SIZE + y) * width + blockX * BLOCK_SIZE + x) * channels;
        const change = adjustment * basis[y * BLOCK_SIZE + x]!;
        for (let channel = 0; channel < colorChannels; channel++) {
          pixels[offset + channel] = Math.max(
            0,
            Math.min(255, Math.round(pixels[offset + channel]! + change)),
          );
        }
      }
    }
  });
  return true;
}

/** Returns an image token only when the marker and checksum survive image encoding. */
export async function readImageSignature(input: Buffer): Promise<string | null> {
  const { data, info } = await sharp(input, {
    limitInputPixels: MAX_IDENTIFY_PIXELS,
    failOn: 'error',
  })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const votes = new Int32Array(SIGNATURE_BITS);
  const count = forEachSignatureBlock(info.width, info.height, (x, y, index) => {
    const coefficient = blockCoefficient(data, info.width, info.channels, x, y);
    const bit = Math.abs(Math.round(coefficient / QUANTUM)) % 2;
    votes[index % SIGNATURE_BITS]! += bit ? 1 : -1;
  });
  if (count < SIGNATURE_BITS) return null;
  const bytes = Buffer.alloc(SIGNATURE_BYTES);
  for (let index = 0; index < SIGNATURE_BITS; index++) {
    if (votes[index]! > 0) bytes[index >> 3]! |= 1 << (7 - (index & 7));
  }
  if (!bytes.subarray(0, 2).equals(MARKER)) return null;
  const token = bytes.subarray(2, 10);
  const checksum = createHash('sha256').update(token).digest().subarray(0, 2);
  return bytes.subarray(10).equals(checksum) ? token.toString('hex') : null;
}
