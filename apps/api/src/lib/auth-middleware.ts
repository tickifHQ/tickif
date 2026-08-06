import type { Context, MiddlewareHandler } from 'hono';
import { getSession, setActiveOrganization, type PlatformRole, type Session } from '@repo/auth';
import { AppError } from './errors.js';
import { orgsService } from '../modules/orgs/service.js';

export type AuthVariables = {
  user: Session['user'] | null;
  session: Session['session'] | null;
};

/** Platform role union, derived from the configured Better Auth role map. */
export type UserRole = PlatformRole;

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
 * Session resolution bypasses better-auth's ≤5-min session cookie cache so
 * server-side role, ban, expiry, and organization changes are visible immediately.
 */
export const withSession: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const result = await getSession(c.req.raw.headers, { disableCookieCache: true });
  if (result?.session && !result.session.activeOrganizationId) {
    const organizationId = await orgsService.findSoleOrganizationForUser(result.user.id);
    if (organizationId) {
      const response = await setActiveOrganization(c.req.raw.headers, organizationId);
      if (response.ok) {
        for (const cookie of response.headers.getSetCookie()) {
          c.header('Set-Cookie', cookie, { append: true });
        }
        result.session.activeOrganizationId = organizationId;
      }
    }
  }
  c.set('user', result?.user ?? null);
  c.set('session', result?.session ?? null);
  await next();
};

/**
 * Shared guard precondition: an authenticated, non-banned account.
 * 401 when unauthenticated; 403 when banned (until banExpires, if set).
 * Bans only block new sign-ins in better-auth itself, so the guard layer must
 * enforce them for already-issued sessions.
 */
function assertActiveUser(
  user: AuthVariables['user'],
): asserts user is NonNullable<AuthVariables['user']> {
  if (!user) {
    throw AppError.unauthorized();
  }
  if (user.banned && (!user.banExpires || user.banExpires > new Date())) {
    throw AppError.forbidden('Account suspended');
  }
}

/** Guard: require an authenticated, non-banned user. 401 / 403 otherwise. */
export const requireAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  assertActiveUser(c.get('user'));
  await next();
};

/**
 * Guard: the user's platform role must be one of `roles` (exact match — no
 * hierarchy, so `admin` does NOT pass a designer-only gate). `superadmin`
 * implicitly passes every role gate. 401 unauthenticated, 403 otherwise
 * (including banned accounts and unknown/missing roles — fail closed).
 */
export function requireAnyRole(
  roles: readonly UserRole[],
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const user = c.get('user');
    assertActiveUser(user);
    const { role } = user;
    if (role !== 'superadmin' && !roles.some((r) => r === role)) {
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
 * 401 unauthenticated; 403 banned; 404 when the resolver finds no resource (don't
 * leak existence); 403 otherwise. Resolver errors propagate to onError (500) —
 * resolvers should validate their own params (e.g. UUID shape) when a malformed
 * value must read as 404 instead.
 */
export function requireOwnership(
  resolve: OwnershipResolver,
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const user = c.get('user');
    assertActiveUser(user);
    const ownership = await resolve(c);
    if (!ownership) {
      throw AppError.notFound();
    }
    if (user.role === 'superadmin') {
      await next();
      return;
    }
    const isOwner = !!ownership.ownerUserId && ownership.ownerUserId === user.id;
    const isMember =
      !isOwner && ownership.organizationId
        ? await orgsService.isMember(user.id, ownership.organizationId)
        : false;
    if (!isOwner && !isMember) {
      throw AppError.forbidden();
    }
    await next();
  };
}
