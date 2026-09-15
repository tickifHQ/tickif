import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';

// Keep the authentication sweep tied to the published contract so newly
// documented protected operations join the matrix automatically.
const document = app.getOpenAPIDocument({
  openapi: '3.1.0',
  info: { title: 'Authentication regression matrix', version: 'test' },
});
const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
const operations = Object.entries(document.paths ?? {}).flatMap(([path, item]) =>
  methods.flatMap((method) => {
    const operation = item?.[method];
    const security = operation?.security ?? document.security;
    // Security alternatives are OR-ed. An empty alternative permits anonymous use.
    const requiresSession =
      security?.length && security.every((alternative) => Object.hasOwn(alternative, 'cookieAuth'));
    return requiresSession ? [{ method, path }] : [];
  }),
);

describe('documented protected routes', () => {
  it('discovers protected operations instead of silently testing an empty matrix', () => {
    expect(operations.length).toBeGreaterThan(100);
  });

  describe.each([
    { actor: 'anonymous', cookie: '' },
    { actor: 'invalid session', cookie: 'better-auth.session_token=invalid.signature' },
  ])('$actor', ({ cookie }) => {
    it('rejects every documented protected operation', async () => {
      for (const { method, path } of operations) {
        const url = path.replace(/\{[^}]+\}/g, '00000000-0000-4000-8000-000000000001');
        const response = await app.request(url, {
          method: method.toUpperCase(),
          headers: { cookie, 'content-type': 'application/json' },
          ...(method === 'get' ? {} : { body: '{}' }),
        });
        expect(response.status, `${method.toUpperCase()} ${path}`).toBe(401);
        await expect(response.json()).resolves.toMatchObject({ error: { code: 'unauthorized' } });
      }
    });
  });
});
