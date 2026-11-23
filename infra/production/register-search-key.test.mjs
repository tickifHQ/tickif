import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { registerSearchKey } from './register-search-key.mjs';

test(
  'search key is idempotent, searches aliases, and cannot write or access other collections',
  { timeout: 120000 },
  async () => {
    const name = `tickif-search-key-test-${randomUUID().slice(0, 8)}`;
    const admin = 'synthetic_admin_'.padEnd(64, 'a');
    const search = 'synthetic_search_'.padEnd(64, 's');
    const image = readFileSync(new URL('./stack.yml', import.meta.url), 'utf8').match(
      /typesense\/typesense:30\.2@sha256:[a-f0-9]+/,
    )[0];
    execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--name',
        name,
        '-p',
        '127.0.0.1::8108',
        '--tmpfs',
        '/data',
        image,
        '--data-dir=/data',
        `--api-key=${admin}`,
      ],
      { stdio: 'pipe' },
    );
    try {
      const port = execFileSync('docker', ['port', name, '8108'], { encoding: 'utf8' })
        .trim()
        .split(':')
        .at(-1);
      const base = `http://127.0.0.1:${port}`;
      const request = (path, key, method = 'GET', body) =>
        fetch(base + path, {
          method,
          headers: { 'X-TYPESENSE-API-KEY': key, 'Content-Type': 'application/json' },
          body: body && JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        });
      for (let attempt = 0; attempt < 100; attempt++) {
        if (
          await fetch(`${base}/health`)
            .then((r) => r.ok)
            .catch(() => false)
        )
          break;
        await setTimeout(200);
      }
      for (const kind of ['projects', 'designers']) {
        const collection = `tickif_production_${kind}_v1`;
        assert.ok(
          (
            await request('/collections', admin, 'POST', {
              name: collection,
              fields: [{ name: 'title', type: 'string' }],
            })
          ).ok,
        );
        assert.ok(
          (
            await request(`/aliases/tickif_production_${kind}`, admin, 'PUT', {
              collection_name: collection,
            })
          ).ok,
        );
      }
      assert.ok(
        (
          await request('/collections', admin, 'POST', {
            name: 'staging_private',
            fields: [{ name: 'title', type: 'string' }],
          })
        ).ok,
      );
      await registerSearchKey(admin, search, base);
      await registerSearchKey(admin, search, base);
      const keys = await (await request('/keys', admin)).json();
      assert.equal(keys.keys.length, 1);
      assert.ok(
        [401, 403].includes(
          (
            await request('/collections/tickif_production_projects/documents', search, 'POST', {
              title: 'forbidden',
            })
          ).status,
        ),
      );
      assert.ok(
        [401, 403].includes(
          (await request('/collections/staging_private/documents/search?q=*', search)).status,
        ),
      );
      await assert.rejects(registerSearchKey(admin, admin, base));
    } finally {
      execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' });
    }
  },
);
