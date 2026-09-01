import type { Context, MiddlewareHandler } from 'hono';
import {
  getSession,
  getSessionWithHeaders,
  setActiveOrganization,
  setActiveTeam,
  type PlatformRole,
  type Session,
} from '@repo/auth';
import type { ActiveContext } from '@repo/contracts';
import { AppError } from './errors.js';
import { orgsService } from '../modules/orgs/service.js';

export type AuthVariables = {
  user: Session['user'] | null;
  session: Session['session'] | null;
  activeContext: ActiveContext;
  /**
   * Whether `user`/`session` were read past the ≤5-min session cookie cache.
   * Optional on purpose: only `withSession` and the guards below set it, so a
   * context that never ran them reads as "not fresh" instead of lying.
   */
  sessionFresh?: boolean;
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
 * This read goes through better-auth's ≤5-min session cookie cache, so what it
 * attaches may be stale. That is fine for identity-only reads (rendering "who am
 * I"), but NOT for authorization: anything that decides access from live account
 * state (`isBanned`, role, `activeOrganizationId`) must run one of the guards
 * below, or `withFreshSession` when the route also has to serve anonymous
 * callers. Each of those refreshes the session at most once per request.
 */
export const withSession: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const result = await getSession(c.req.raw.headers);
  let autoSelectedOrganizationId: string | null = null;
  if (result?.session && !result.session.activeOrganizationId) {
    const preferredContext = await orgsService.resolvePreferredContext(result.user.id);
    if (preferredContext.kind === 'organization') {
      const response = await setActiveOrganization(
        c.req.raw.headers,
        preferredContext.organizationId,
      );
      if (response.ok) {
        for (const cookie of response.headers.getSetCookie()) {
          c.header('Set-Cookie', cookie, { append: true });
        }
        result.session.activeOrganizationId = preferredContext.organizationId;
        autoSelectedOrganizationId = preferredContext.organizationId;
      }
    }
  }
  if (
    result?.session &&
    autoSelectedOrganizationId &&
    !result.session.activeTeamId &&
    typeof orgsService.findDefaultActiveTeamForUser === 'function'
  ) {
    const preferredContext = await orgsService.resolvePreferredContext(result.user.id);
    const teamId =
      preferredContext.kind === 'organization' &&
      preferredContext.organizationId === autoSelectedOrganizationId
        ? preferredContext.teamId
        : await orgsService.findDefaultActiveTeamForUser(
            result.user.id,
            autoSelectedOrganizationId,
          );
    if (teamId) {
      const response = await setActiveTeam(c.req.raw.headers, teamId);
      if (response.ok) {
        for (const cookie of response.headers.getSetCookie()) {
          c.header('Set-Cookie', cookie, { append: true });
        }
        result.session.activeTeamId = teamId;
      }
    }
  }
  c.set('user', result?.user ?? null);
  c.set('session', result?.session ?? null);
  c.set(
    'activeContext',
    result?.session.activeOrganizationId && result.session.activeTeamId
      ? {
          kind: 'organization',
          organizationId: result.session.activeOrganizationId,
          teamId: result.session.activeTeamId,
        }
      : { kind: 'personal' },
  );
  c.set('sessionFresh', false);
  await next();
};

/**
 * Re-reads the session past the cookie cache, at most once per request, and forwards
 * better-auth's response cookies so the client's stale `session_data` blob is replaced
 * (or cleared, when the session is gone) instead of surviving its full TTL.
 */
async function refreshSession(c: Context<{ Variables: AuthVariables }>): Promise<void> {
  // Already refreshed by an earlier guard on this request — nothing to do.
  if (c.get('sessionFresh')) return;
  // The cookie cache only ever caches a *positive* session, so a cached read that
  // found nothing already came from the database. Re-reading it would just double
  // the query cost of every 401 (and of a revoked-cookie replay).
  if (!c.get('user')) return;

  const { session: result, headers } = await getSessionWithHeaders(c.req.raw.headers, {
    disableCookieCache: true,
  });
  for (const cookie of headers.getSetCookie()) {
    c.header('Set-Cookie', cookie, { append: true });
  }
  c.set('user', result?.user ?? null);
  c.set('session', result?.session ?? null);
  c.set(
    'activeContext',
    result?.session.activeOrganizationId && result.session.activeTeamId
      ? {
          kind: 'organization',
          organizationId: result.session.activeOrganizationId,
          teamId: result.session.activeTeamId,
        }
      : { kind: 'personal' },
  );
  c.set('sessionFresh', true);
}

async function getFreshActiveUser(
  c: Context<{ Variables: AuthVariables }>,
): Promise<NonNullable<AuthVariables['user']>> {
  await refreshSession(c);
  const user = c.get('user');
  assertActiveUser(user);
  return user;
}

/**
 * Optional-auth counterpart to the guards: refreshes the session past the cookie
 * cache without rejecting anonymous callers.
 *
 * Attach this to routes that must keep serving anonymous traffic yet still decide
 * authorization from live account state further down — e.g. `GET /projects/{id}`,
 * where a published project is public but draft visibility is decided from the
 * caller's ban/role. Without it those decisions run on a ≤5-min stale session.
 */
export const withFreshSession: MiddlewareHandler<{ Variables: AuthVariables }> = async (
  c,
  next,
) => {
  await refreshSession(c);
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
  await getFreshActiveUser(c);
  await next();
};

export function requireContext(
  kind: ActiveContext['kind'],
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    await getFreshActiveUser(c);
    if (c.get('activeContext').kind !== kind) {
      throw AppError.forbidden(`Switch to ${kind} context to continue`);
    }
    await next();
  };
}

export const requirePersonalContext = requireContext('personal');
export const requireOrganizationContext = requireContext('organization');

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
    const user = await getFreshActiveUser(c);
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
    const user = await getFreshActiveUser(c);
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
