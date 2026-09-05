import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertProductionEmailConfig,
  assertProductionSearchConfig,
  parseConfig,
  sensitiveFileVariables,
} from '../src/index.js';

const directories: string[] = [];

function secretFile(value: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'tickif-config-'));
  directories.push(directory);
  const path = join(directory, 'secret');
  writeFileSync(path, value, { encoding: 'utf8', mode: 0o600 });
  return path;
}

function baseEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'development',
    BETTER_AUTH_URL: 'http://localhost:3001',
    BETTER_AUTH_SECRET_FILE: secretFile('file-auth-secret-0123456789\n'),
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Swarm secret-file configuration', () => {
  it('loads allow-listed sensitive values and trims only trailing newlines', () => {
    const parsed = parseConfig({
      ...baseEnvironment(),
      POSTGRES_PASSWORD_FILE: secretFile('p@ss word\r\n'),
      REDIS_PASSWORD_FILE: secretFile('redis-secret\n'),
    });

    expect(parsed.BETTER_AUTH_SECRET).toBe('file-auth-secret-0123456789');
    expect(parsed.POSTGRES_PASSWORD).toBe('p@ss word');
    expect(parsed.DATABASE_URL).toContain('p%40ss%20word');
    expect(parsed.REDIS_URL).toBe('redis://:redis-secret@localhost:6379');
  });

  it('rejects ambiguous direct and file-backed values', () => {
    expect(() =>
      parseConfig({
        ...baseEnvironment(),
        BETTER_AUTH_SECRET: 'direct-auth-secret-0123456789',
      }),
    ).toThrow('set either BETTER_AUTH_SECRET or BETTER_AUTH_SECRET_FILE');
  });

  it('rejects missing and empty secret files without exposing their contents', () => {
    expect(() =>
      parseConfig({
        ...baseEnvironment(),
        R2_SECRET_ACCESS_KEY_FILE: join(tmpdir(), 'tickif-does-not-exist'),
      }),
    ).toThrow('R2_SECRET_ACCESS_KEY_FILE');

    expect(() =>
      parseConfig({
        ...baseEnvironment(),
        R2_SECRET_ACCESS_KEY_FILE: secretFile('\n'),
      }),
    ).toThrow('secret file is empty');
  });

  it('keeps file loading explicitly limited to credential variables', () => {
    expect(sensitiveFileVariables).not.toContain('PORT');
    const parsed = parseConfig({ ...baseEnvironment(), PORT_FILE: secretFile('9999') });
    expect(parsed.PORT).toBe(8008);
  });

  it('uses file-backed values in boundary-specific production assertions', () => {
    const environment = {
      NODE_ENV: 'production',
      RESEND_API_KEY_FILE: secretFile('production-resend-key'),
      EMAIL_FROM: 'Tickif <hello@tickif.example>',
      TYPESENSE_HOST: 'http://typesense:8108',
      TYPESENSE_API_KEY_FILE: secretFile('production-admin-key'),
      TYPESENSE_SEARCH_API_KEY_FILE: secretFile('production-search-key'),
    } satisfies NodeJS.ProcessEnv;

    expect(() => assertProductionEmailConfig(environment)).not.toThrow();
    expect(() => assertProductionSearchConfig(environment)).not.toThrow();
  });
});
