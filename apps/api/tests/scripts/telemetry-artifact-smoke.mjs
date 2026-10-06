import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

// Exercise the compiled artifact with its real supported ESM loader. No app DB,
// auth, collector, or live credential is required by this compatibility gate.
if (process.argv[2] === 'child') {
  const preloader = await readFile(new URL('../../dist/telemetry.js', import.meta.url), 'utf8');
  const chunk = preloader.match(/from ["'](\.\/chunk-[^"']+\.js)["']/)?.[1];
  assert.ok(chunk, 'Compiled preloader must reference its shared runtime chunk');
  const { trace, shutdownTelemetry } = await import(new URL(`../../dist/${chunk.slice(2)}`, import.meta.url));
  const destination = process.argv[3];
  assert.ok(destination);
  await trace.getTracer('tickif.artifact.smoke').startActiveSpan('artifact.smoke', async (span) => {
    await globalThis.fetch(`${destination}/target?token=artifact-secret-marker`);
    span.end();
  });
  assert.equal(await shutdownTelemetry(3_000), true, 'Telemetry must shut down within budget');
} else {
  const payloads = [];
  const collector = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (request.url === '/v1/traces') payloads.push(Buffer.concat(chunks));
    response.setHeader('content-type', 'application/x-protobuf');
    response.end();
  });
  await new Promise((resolve) => collector.listen(0, '127.0.0.1', resolve));
  const address = collector.address();
  assert.ok(address && typeof address !== 'string');
  const endpoint = `http://127.0.0.1:${address.port}`;
  let errorOutput = '';
  try {
    const child = spawn(process.execPath, [
      '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
      '--import', './dist/telemetry.js',
      fileURLToPath(import.meta.url), 'child', endpoint,
    ], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env: {
        NODE_ENV: 'test', DEPLOYMENT_ENV: 'staging', LOG_LEVEL: 'silent',
        TELEMETRY_ENABLED: 'true', TELEMETRY_BROWSER_INGEST_ENABLED: 'false',
        OTEL_TRACES_SAMPLER_ARG: '1', OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
        APP_VERSION: 'artifact-smoke',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 15_000,
    });
    child.stderr.on('data', (chunk) => { errorOutput += chunk.toString(); });
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    assert.equal(code, 0, errorOutput);
    const exported = Buffer.concat(payloads).toString('utf8');
    assert.ok(exported.includes('artifact.smoke'), 'Manual application span was not exported');
    assert.ok(exported.includes('@opentelemetry/instrumentation-undici'), 'ESM outgoing dependency instrumentation was not exported');
    assert.ok(!exported.includes('artifact-secret-marker'), 'Sensitive URL query reached exported traces');
    console.log('Built API ESM preloader, dependency instrumentation, trace privacy and bounded shutdown passed.');
  } finally {
    collector.closeAllConnections();
    await new Promise((resolve) => collector.close(resolve));
  }
}
