import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('staging browser permissions', () => {
  it('allows same-origin device location while denying camera and microphone access', () => {
    const config = readFileSync(
      path.resolve(import.meta.dirname, '../../../../infra/staging/traefik/dynamic.yml'),
      'utf8',
    );
    const policy = config.match(/^\s*permissionsPolicy: '([^']+)'\s*$/m)?.[1];

    expect(policy).toBeDefined();
    expect(policy?.split(',').map((directive) => directive.trim())).toEqual([
      'camera=()',
      'microphone=()',
      'geolocation=(self)',
    ]);
  });
});
