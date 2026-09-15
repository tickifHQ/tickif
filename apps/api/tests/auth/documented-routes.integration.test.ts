import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { createRoleSession, backdateSession } from '../helpers/auth.js';
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
  it.each(['expired', 'revoked', 'banned'] as const)(
    'rejects a %s superadmin session on every protected operation',
    async (state) => {
      const actor = await createRoleSession('+919800019901', 'superadmin');
      const warm = await app.request('/api/auth/get-session?disableCookieCache=true', {
        headers: { cookie: actor.cookie },
      });
      expect(warm.status).toBe(200);
      const cachedCookies = warm.headers.getSetCookie().map((value) => value.split(';')[0]);
      expect(cachedCookies.some((value) => /^better-auth\.session_data=.+/.test(value ?? ''))).toBe(
        true,
      );
      const cookie = [actor.cookie, ...cachedCookies].join('; ');

      if (state === 'expired') {
        await backdateSession(actor.userId, { expiresAt: new Date('2000-01-01T00:00:00Z') });
      } else if (state === 'revoked') {
        await db.delete(schema.session).where(eq(schema.session.userId, actor.userId));
      } else {
        await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, actor.userId));
      }
      const expectedStatus = state === 'banned' ? 403 : 401;
      for (const { method, path } of operations) {
        const response = await app.request(
          path.replace(/\{[^}]+\}/g, '00000000-0000-4000-8000-000000000001'),
          {
            method: method.toUpperCase(),
            headers: { cookie, 'content-type': 'application/json' },
            ...(method === 'get' ? {} : { body: '{}' }),
          },
        );
        expect
          .soft(response.status, `${state}: ${method.toUpperCase()} ${path}`)
          .toBe(expectedStatus);
      }
    },
  );
});
