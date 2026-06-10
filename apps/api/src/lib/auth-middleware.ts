import type { Context, MiddlewareHandler } from 'hono';
import { getSession, type Session } from '@repo/auth';
import { schema } from '@repo/db';
import { AppError } from './errors.js';
import { isOrgMember } from '../modules/orgs/repository.js';

export type AuthVariables = {
  user: Session['user'] | null;
  session: Session['session'] | null;
};

/** Platform role union, derived from the DB enum (single source of truth). */
export type UserRole = (typeof schema.userRole.enumValues)[number];

/** Who may act on a resource: its owning user and/or its owning organization. */
export type Ownership = {
  ownerUserId: string | null;
  organizationId?: string | null;
};

/** Resolves the requested resource's ownership; return null when it doesn't exist. */
export type OwnershipResolver = (c: Context) => Promise<Ownership | null>;

/**
 * Resolves the better-auth session from the incoming request and attaches
 * `user` / `session` to the Hono context. Always runs; does not block.
 *
 * Note: reads go through the ≤5-min session cookie cache (E-83), so role/ban
 * changes can be served stale for up to that window by the guards below.
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

/**
 * Guard: the user's platform role must be one of `roles` (exact match — no
 * hierarchy, so `admin` does NOT pass a designer-only gate). `superadmin`
 * implicitly passes every role gate. 401 unauthenticated, 403 otherwise.
 */
export function requireAnyRole(
  roles: readonly UserRole[],
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw AppError.unauthorized();
    }
    const role = user.role as UserRole;
    if (role !== 'superadmin' && !roles.includes(role)) {
      throw AppError.forbidden();
    }
    await next();
  };
}

/** Guard: single-role convenience over requireAnyRole. */
export function requireRole(role: UserRole): MiddlewareHandler<{ Variables: AuthVariables }> {
  return requireAnyRole([role]);
}

/**
 * Guard: the user must own the resource, or belong to its owning organization
 * (company-team access, E-66 model), or be superadmin. Platform `admin` gets NO
 * implicit pass — admin moderation routes should declare requireAnyRole(['admin']).
 *
 * 401 unauthenticated; 404 when the resolver finds no resource (don't leak
 * existence); 403 otherwise.
 */
export function requireOwnership(
  resolve: OwnershipResolver,
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw AppError.unauthorized();
    }
    const ownership = await resolve(c);
    if (!ownership) {
      throw AppError.notFound();
    }
    const isOwner = !!ownership.ownerUserId && ownership.ownerUserId === user.id;
    const isMember =
      !isOwner && ownership.organizationId
        ? await isOrgMember(user.id, ownership.organizationId)
        : false;
    if (!isOwner && !isMember && (user.role as UserRole) !== 'superadmin') {
      throw AppError.forbidden();
    }
    await next();
  };
}
