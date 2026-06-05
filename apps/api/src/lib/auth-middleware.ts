import type { MiddlewareHandler } from 'hono';
import { getSession, type Session } from '@repo/auth';
import { AppError } from './errors.js';

export type AuthVariables = {
  user: Session['user'] | null;
  session: Session['session'] | null;
};

/**
 * Resolves the better-auth session from the incoming request and attaches
 * `user` / `session` to the Hono context. Always runs; does not block.
 */
export const withSession: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const result = await getSession(c.req.raw.headers);
  c.set('user', result?.user ?? null);
  c.set('session', result?.session ?? null);
  await next();
};

/** Guard: require an authenticated user. Throws AppError(401) otherwise. */
export const requireAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  if (!c.get('user')) {
    throw AppError.unauthorized();
  }
  await next();
};
