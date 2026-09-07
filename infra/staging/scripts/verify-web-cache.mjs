// Run inside the real web container as its configured non-root user.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rename, rm, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const cacheDirectory = '/app/apps/web/.next/cache';
assert.equal(process.getuid(), 1001, 'Web runtime must remain the non-root app user');
const filesystem = await statfs(cacheDirectory);
assert.equal(filesystem.type, 0x01021994, 'Web cache must be on its dedicated tmpfs');
assert.ok(
  filesystem.blocks * filesystem.bsize <= 128 * 1024 * 1024,
  'Web cache tmpfs must be bounded to 128 MiB',
);

const probeDirectory = await mkdtemp(join(cacheDirectory, 'runtime-probe-'));
try {
  const temporary = join(probeDirectory, 'entry.tmp');
  const destination = join(probeDirectory, 'entry');
  await writeFile(temporary, 'synthetic-cache-entry');
  await rename(temporary, destination);
  assert.equal(await readFile(destination, 'utf8'), 'synthetic-cache-entry');

  for (const path of ['/health', '/login']) {
    const response = await fetch(`http://127.0.0.1:3000${path}`, {
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 200, `Web runtime must serve ${path}`);
    await response.arrayBuffer();
  }
} finally {
  await rm(probeDirectory, { recursive: true });
}
console.log('Non-root web cache create/write/rename/read and health/login requests passed.');
