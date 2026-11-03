import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

// A local RESP rejection fixture reproduces invalid Redis authentication without
// touching a running Redis instance or importing the worker runtime into the test.
const sockets = new Set();
const redis = createServer((socket) => {
  sockets.add(socket);
  socket.on('error', () => {});
  socket.on('close', () => sockets.delete(socket));
  socket.on('data', () => socket.write('-WRONGPASS synthetic-rejected-credentials\r\n'));
});
redis.listen(0, '127.0.0.1');
await once(redis, 'listening');
const redisAddress = redis.address();
assert(redisAddress && typeof redisAddress !== 'string');
const portReservation = createServer();
portReservation.listen(0, '127.0.0.1');
await once(portReservation, 'listening');
const address = portReservation.address();
assert(address && typeof address !== 'string');
await new Promise((resolve) => portReservation.close(resolve));

const worker = spawn(
  process.execPath,
  [fileURLToPath(new URL('../dist/index.js', import.meta.url))],
  {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TELEMETRY_ENABLED: 'false',
      TELEMETRY_BROWSER_INGEST_ENABLED: 'false',
      TELEMETRY_QUEUE_METRICS_ENABLED: 'false',
      BETTER_AUTH_SECRET: 'worker-readiness-only-synthetic-secret-000000000',
      BETTER_AUTH_URL: 'http://localhost:8008',
      DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/tickif_worker_smoke_test',
      REDIS_URL: `redis://:synthetic-rejected-credentials@127.0.0.1:${redisAddress.port}/15`,
      TYPESENSE_HOST: 'http://127.0.0.1:1',
      TYPESENSE_API_KEY: 'synthetic-worker-readiness-key',
      TYPESENSE_SEARCH_API_KEY: 'synthetic-worker-readiness-key',
      TYPESENSE_COLLECTION_PREFIX: 'tickif_worker_smoke',
      R2_ENDPOINT: 'http://127.0.0.1:1',
      R2_ACCESS_KEY_ID: 'synthetic',
      R2_SECRET_ACCESS_KEY: 'synthetic',
      R2_BUCKET: 'synthetic-worker-smoke',
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
      GOOGLE_CLIENT_SECRET_FILE: undefined,
      GOOGLE_PLACES_API_KEY: undefined,
      GOOGLE_PLACES_API_KEY_FILE: undefined,
      WORKER_HEALTH_PORT: String(address.port),
    },
  },
);
const exited = once(worker, 'exit');
try {
  let live = false;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && worker.exitCode === null) {
    try {
      live =
        (
          await fetch(`http://127.0.0.1:${address.port}/livez`, {
            signal: AbortSignal.timeout(1_000),
          })
        ).status === 200;
      if (live) break;
    } catch {}
    await delay(100);
  }
  assert(live, 'Worker must expose liveness even while Redis rejects authentication');
  // Outlast the initial dependency probe; initial unready state alone is insufficient.
  await delay(2_000);
  assert.equal((await fetch(`http://127.0.0.1:${address.port}/livez`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${address.port}/readyz`)).status, 503);
  console.log('Compiled worker stays live and unready with rejected Redis credentials.');
} finally {
  worker.kill('SIGKILL');
  await exited;
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => redis.close(resolve));
}
