import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { generateDerivatives } from '../../src/media/derivatives.js';
import { signatureToken } from '../../src/media/signature.js';

const execute = promisify(execFile);

it('identifies a downloaded derivative through the CLI and rejects incorrect candidates', async () => {
  const imageId = '12345678-90ab-4cde-8f01-23456789abcd';
  const photo = await readFile(
    new URL('../../../web/public/images/home-hero/warm-pendant-living-room.jpg', import.meta.url),
  );
  const [derivative] = await generateDerivatives(photo, {
    variants: [{ variant: 'thumb', width: 320 }],
    formats: ['webp'],
    watermark: { text: 'tickif', opacity: 0.65, scale: 0.08 },
    signatureId: imageId,
  });
  const directory = await mkdtemp(join(tmpdir(), 'tickif-identify-'));
  try {
    const signedPath = join(directory, 'downloaded image.webp');
    const originalPath = join(directory, 'original.jpg');
    await writeFile(signedPath, derivative!.buffer);
    await writeFile(originalPath, photo);
    const cliArgs = [
      '--import',
      'tsx',
      fileURLToPath(new URL('../../src/identify-image.ts', import.meta.url)),
      '--',
    ];
    const { stdout } = await execute(process.execPath, [...cliArgs, signedPath, imageId]);
    expect(stdout).toContain(`Tickif image token: ${signatureToken(imageId)}`);
    expect(stdout).toContain('Image ID matches.');
    await expect(
      execute(process.execPath, [...cliArgs, signedPath, 'different-image-id']),
    ).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('Image ID does not match.'),
    });
    await expect(
      execute(process.execPath, [...cliArgs, originalPath, imageId]),
    ).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('No Tickif image signature found.'),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
