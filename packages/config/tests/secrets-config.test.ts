import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertProductionEmailConfig,
  assertProductionSearchConfig,
  parseConfig,
} from '../src/index.js';

const directories: string[] = [];
function secretFile(content: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'tickif-config-test-'));
  directories.push(directory);
  const file = join(directory, 'credentials');
  writeFileSync(file, content);
  return file;
}
afterEach(() =>
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true })),
);

describe('mounted secrets', () => {
  it('loads typed credentials without mutating the caller environment', () => {
    const environment = {
      NODE_ENV: 'test',
      BETTER_AUTH_URL: 'http://localhost:3001',
      CONFIG_SECRETS_FILE: secretFile(
        'BETTER_AUTH_SECRET="synthetic#secret-long"\nPOSTGRES_PASSWORD="test@password"\n',
      ),
    };
    const parsed = parseConfig(environment);
    expect(parsed.BETTER_AUTH_SECRET).toBe('synthetic#secret-long');
    expect(parsed.DATABASE_URL).toContain('test%40password');
    expect(environment).not.toHaveProperty('BETTER_AUTH_SECRET');
  });
  it('uses the same mounted values at production email and search boundaries', () => {
    const environment = {
      NODE_ENV: 'production',
      EMAIL_FROM: 'Tickif <staging@example.com>',
      TYPESENSE_HOST: 'http://typesense:8108',
      CONFIG_SECRETS_FILE: secretFile(
        'RESEND_API_KEY=synthetic-resend\nTYPESENSE_API_KEY=synthetic-admin-key\nTYPESENSE_SEARCH_API_KEY=synthetic-search-key\n',
      ),
    };
    expect(() => assertProductionEmailConfig(environment)).not.toThrow();
    expect(() => assertProductionSearchConfig(environment)).not.toThrow();
  });
  it('fails closed on unreadable files, conflicting sources, or non-secret settings', () => {
    expect(() => parseConfig({ CONFIG_SECRETS_FILE: 'missing-file' })).toThrow('could not be read');
    expect(() => parseConfig({ CONFIG_SECRETS_FILE: secretFile('NODE_ENV=development') })).toThrow(
      'unsupported key',
    );
    expect(() =>
      parseConfig({
        BETTER_AUTH_SECRET: 'direct',
        CONFIG_SECRETS_FILE: secretFile('BETTER_AUTH_SECRET=mounted'),
      }),
    ).toThrow('either environment or secret file');
  });
  it('validates mounted values without including their values in errors', () => {
    const run = () =>
      parseConfig({ CONFIG_SECRETS_FILE: secretFile('BETTER_AUTH_SECRET=short-secret') });
    expect(run).toThrow('BETTER_AUTH_SECRET');
    expect(run).not.toThrow('short-secret');
  });
});
