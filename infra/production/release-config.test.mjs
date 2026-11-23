import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseConfig } from './release-config.mjs';

const base = {
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_RUN_NUMBER: '123',
  PRODUCTION_HOST: 'tickif.com',
  STAGING_HOST: 'staging.tickif.com',
};

test('the same commit has distinct production and staging images and origins', () => {
  const prod = releaseConfig({ ...base, GITHUB_REF: 'refs/heads/main' });
  const staging = releaseConfig({ ...base, GITHUB_REF: 'refs/heads/staging' });
  assert.equal(prod.host, 'tickif.com');
  assert.equal(staging.host, 'staging.tickif.com');
  assert.notEqual(prod.image_tag, staging.image_tag);
  assert.equal(prod.version, 'v0.1.123');
  assert.equal(staging.image_tag, base.GITHUB_SHA);
});

test('rerunning a release preserves its version', () => {
  const env = { ...base, GITHUB_REF: 'refs/heads/main' };
  assert.deepEqual(releaseConfig(env), releaseConfig({ ...env, GITHUB_RUN_ATTEMPT: '2' }));
});

test('production never falls back to staging when configuration is missing', () => {
  assert.throws(() =>
    releaseConfig({ ...base, GITHUB_REF: 'refs/heads/main', PRODUCTION_HOST: '' }),
  );
});

test('rejects pull request refs, malformed revisions, and output injection', () => {
  assert.throws(() => releaseConfig({ ...base, GITHUB_REF: 'refs/pull/1/merge' }));
  assert.throws(() =>
    releaseConfig({ ...base, GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'latest' }),
  );
  assert.throws(() =>
    releaseConfig({
      ...base,
      GITHUB_REF: 'refs/heads/main',
      PRODUCTION_HOST: 'tickif.com\nimage_tag=evil',
    }),
  );
});
