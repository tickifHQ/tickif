import { readFile } from 'node:fs/promises';
import { readImageSignature, signatureToken } from './media/signature.js';

async function main() {
  const args = process.argv.slice(2);
  // pnpm forwards the optional separator used in the documented command.
  const [path, imageId] = args[0] === '--' ? args.slice(1) : args;
  if (!path) {
    throw new Error('Usage: pnpm --filter @repo/worker media:identify <image-path> [image-id]');
  }
  const token = await readImageSignature(await readFile(path));
  if (!token) {
    console.log('No Tickif image signature found.');
    if (imageId) process.exitCode = 1;
    return;
  }
  console.log(`Tickif image token: ${token}`);
  if (imageId) {
    const matched = token === signatureToken(imageId);
    console.log(matched ? 'Image ID matches.' : 'Image ID does not match.');
    if (!matched) process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
