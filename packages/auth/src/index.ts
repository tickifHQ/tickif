import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { phoneNumber, admin, organization, emailOTP } from 'better-auth/plugins';
import crypto from 'node:crypto';
import { ACCOUNT_STATUS_VALUES, ADMIN_PLATFORM_ROLES, PLATFORM_ROLE } from '@repo/contracts';
import { and, db, eq, inArray, isNull, or, schema } from '@repo/db';
import { assertProductionEmailConfig, config } from '@repo/config';
import { enqueueSms } from '@repo/queue';
import { ac, orgAc, orgRoles, roles } from './permissions.js';
import {
  organizationMembershipLimit,
  organizationBranchLimit,
  requireActiveOrganizationMember,
  requireOrganizationMember,
  requireOrganizationRbac,
  validateOrganizationRoleChange,
} from './organization-policy.js';
import { escapeHtml, sendEmail } from './email.js';

assertProductionEmailConfig();

/**
 * Tickif auth — better-auth instance.
 *
 * - Phone OTP is primary (Indian market) via the phoneNumber plugin.
 * - Gmail SSO for designers via the Google social provider.
 * - The 4-role RBAC rides on the admin + organization plugins rather than a
 *   hand-rolled layer.
 *
 * Tables live in @repo/db's Drizzle schema so auth + domain data share a single
 * migration set. The adapter auto-discovers them from the shared `db` instance.
 */

const googleClientId = config.GOOGLE_CLIENT_ID;
const googleClientSecret = config.GOOGLE_CLIENT_SECRET;
const googleEnabled = !!(googleClientId && googleClientSecret);

const socialProviders = googleEnabled
  ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
  : undefined;

const ACTIVE_MEMBER_ORGANIZATION_MUTATIONS = new Set([
  '/organization/update',
  '/organization/invite-member',
  '/organization/cancel-invitation',
  '/organization/remove-member',
  '/organization/update-member-role',
]);

const ACTIVE_MEMBER_ORGANIZATION_READS = new Set([
  '/organization/get-full-organization',
  '/organization/get-active-member',
  '/organization/list-members',
  '/organization/list-invitations',
  '/organization/get-active-member-role',
]);

const LIFECYCLE_ORGANIZATION_MUTATIONS = new Set([
  '/organization/leave',
  '/organization/remove-member',
  '/organization/accept-invitation',
  '/organization/reject-invitation',
  '/organization/cancel-invitation',
]);

const TEAM_CONTEXT_MUTATIONS = new Set([
  '/organization/set-active',
  '/organization/set-active-team',
]);

function bodyString(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const value = Reflect.get(body, key);
  return typeof value === 'string' ? value : undefined;
}

function branchSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'branch';
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

async function availableBranchSlug(name: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = branchSlug(name);
    const [profile, organization] = await Promise.all([
      db
        .select({ id: schema.designerProfile.id })
        .from(schema.designerProfile)
        .where(eq(schema.designerProfile.slug, candidate))
        .limit(1),
      db
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.slug, candidate))
        .limit(1),
    ]);
    if (!profile[0] && !organization[0]) return candidate;
  }
  throw new APIError('CONFLICT', {
    code: 'BRANCH_SLUG_CONFLICT',
    message: 'Could not allocate a unique branch slug',
  });
}

async function activeInvitationTeamIds(input: {
  organizationId: string;
  teamId?: string | null;
  teamIds?: unknown;
}): Promise<string[]> {
  const requestedIds = Array.isArray(input.teamIds)
    ? input.teamIds.filter((teamId): teamId is string => typeof teamId === 'string' && !!teamId)
    : (input.teamId?.split(',').filter(Boolean) ?? []);
  if (requestedIds.length === 0) {
    const [team] = await db
      .select({ id: schema.team.id })
      .from(schema.team)
      .where(
        and(eq(schema.team.organizationId, input.organizationId), eq(schema.team.frozen, false)),
      )
      .orderBy(schema.team.createdAt, schema.team.id)
      .limit(1);
    if (!team) {
      throw new APIError('BAD_REQUEST', {
        code: 'ACTIVE_BRANCH_REQUIRED',
        message: 'The organization has no active branch',
      });
    }
    return [team.id];
  }

  const teams = await db
    .select({ id: schema.team.id })
    .from(schema.team)
    .where(
      and(
        inArray(schema.team.id, requestedIds),
        eq(schema.team.organizationId, input.organizationId),
        eq(schema.team.frozen, false),
      ),
    );
  if (teams.length !== new Set(requestedIds).size) {
    throw new APIError('FORBIDDEN', {
      code: 'BRANCH_INACTIVE',
      message: 'Branch is inactive',
    });
  }
  return requestedIds;
}

async function requireActiveTeam(teamId: string): Promise<void> {
  const [row] = await db
    .select({ frozen: schema.team.frozen })
    .from(schema.team)
    .where(eq(schema.team.id, teamId))
    .limit(1);
  if (!row || row.frozen) {
    throw new APIError('FORBIDDEN', {
      code: 'BRANCH_INACTIVE',
      message: 'Branch is inactive',
    });
  }
}

async function protectedMutationOrganizationId(
  path: string,
  body: unknown,
  activeOrganizationId: string | null | undefined,
): Promise<string | undefined> {
  const invitationId = bodyString(body, 'invitationId');
  if (!invitationId) {
    return bodyString(body, 'organizationId') ?? activeOrganizationId ?? undefined;
  }

  const [invitation] = await db
    .select({ organizationId: schema.invitation.organizationId })
    .from(schema.invitation)
    .where(eq(schema.invitation.id, invitationId))
    .limit(1);
  return invitation?.organizationId;
}

async function protectedReadOrganizationId(
  query: unknown,
  activeOrganizationId: string | null | undefined,
): Promise<string | undefined> {
  const organizationId = bodyString(query, 'organizationId');
  const organizationSlug = bodyString(query, 'organizationSlug');
  if (organizationId && organizationSlug) {
    throw new APIError('BAD_REQUEST', {
      code: 'AMBIGUOUS_ORGANIZATION_SELECTOR',
      message: 'Provide either organizationId or organizationSlug, not both',
    });
  }
  if (organizationId) return organizationId;
  if (!organizationSlug) return activeOrganizationId ?? undefined;
  const [organization] = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.slug, organizationSlug))
    .limit(1);
  return organization?.id;
}

async function cancelPendingTransfersForParticipant(input: {
  organizationId: string;
  participantUserId: string;
  actorUserId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const cancelledAt = new Date();
    const cancelled = await tx
      .update(schema.ownershipTransferRequest)
      .set({ status: 'cancelled', resolvedAt: cancelledAt, updatedAt: cancelledAt })
      .where(
        and(
          eq(schema.ownershipTransferRequest.organizationId, input.organizationId),
          eq(schema.ownershipTransferRequest.status, 'pending'),
          or(
            eq(schema.ownershipTransferRequest.targetUserId, input.participantUserId),
            eq(schema.ownershipTransferRequest.initiatorUserId, input.participantUserId),
          ),
        ),
      )
      .returning({ id: schema.ownershipTransferRequest.id });
    if (cancelled.length > 0) {
      await tx.insert(schema.ownershipTransferAuditEvent).values(
        cancelled.map(({ id }) => ({
          transferId: id,
          status: 'cancelled' as const,
          actorUserId: input.actorUserId,
          createdAt: cancelledAt,
        })),
      );
    }
  });
}

async function removedMember(body: unknown, organizationId: string) {
  const memberIdOrEmail = bodyString(body, 'memberIdOrEmail');
  if (!memberIdOrEmail) return undefined;
  const [member] = await db
    .select({ userId: schema.member.userId, role: schema.member.role })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        or(eq(schema.member.id, memberIdOrEmail), eq(schema.user.email, memberIdOrEmail)),
      ),
    )
    .limit(1);
  return member;
}
export const auth = betterAuth({
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.BETTER_AUTH_URL,

  // Trusted origins for cross-origin auth requests (web app on a different port/domain).
  // Driven by TRUSTED_ORIGINS env var — no hardcoded URLs.
  // Dev: "http://localhost:3000". Prod same-origin: leave empty.
  trustedOrigins: config.TRUSTED_ORIGINS,

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const isProtectedRead = ACTIVE_MEMBER_ORGANIZATION_READS.has(ctx.path);
      const requiresActiveMembership =
        isProtectedRead || ACTIVE_MEMBER_ORGANIZATION_MUTATIONS.has(ctx.path);
      const isLifecycleMutation = LIFECYCLE_ORGANIZATION_MUTATIONS.has(ctx.path);
      const isTeamContextMutation = TEAM_CONTEXT_MUTATIONS.has(ctx.path);
      if (!requiresActiveMembership && !isLifecycleMutation && !isTeamContextMutation) return;

      const session = await getAuthoritativeSessionFromCtx(ctx);
      if (!session) throw new APIError('UNAUTHORIZED');
      if (ctx.path === '/organization/set-active') {
        const organizationId = bodyString(ctx.body, 'organizationId');
        if (!organizationId) {
          await db
            .update(schema.session)
            .set({ activeTeamId: null })
            .where(eq(schema.session.id, session.session.id));
          return;
        }
        const [activeTeam] = await db
          .select({ id: schema.team.id })
          .from(schema.team)
          .innerJoin(schema.teamMember, eq(schema.teamMember.teamId, schema.team.id))
          .where(
            and(
              eq(schema.team.organizationId, organizationId),
              eq(schema.teamMember.userId, session.user.id),
              eq(schema.team.frozen, false),
            ),
          )
          .orderBy(schema.team.createdAt, schema.team.id)
          .limit(1);
        await db
          .update(schema.session)
          .set({ activeTeamId: activeTeam?.id ?? null })
          .where(eq(schema.session.id, session.session.id));
        return;
      }
      if (ctx.path === '/organization/set-active-team') {
        const teamId = bodyString(ctx.body, 'teamId');
        if (!teamId) return;
        const [target] = await db
          .select({ organizationId: schema.team.organizationId, frozen: schema.team.frozen })
          .from(schema.team)
          .innerJoin(schema.teamMember, eq(schema.teamMember.teamId, schema.team.id))
          .where(
            and(eq(schema.team.id, teamId), eq(schema.teamMember.userId, session.user.id)),
          )
          .limit(1);
        if (!target || target.frozen) {
          throw new APIError('FORBIDDEN', {
            code: 'BRANCH_INACTIVE',
            message: 'Branch is inactive',
          });
        }
        await requireActiveOrganizationMember(session.user.id, target.organizationId);
        return;
      }
      const organizationId = isProtectedRead
        ? await protectedReadOrganizationId(ctx.query, session.session.activeOrganizationId)
        : await protectedMutationOrganizationId(
            ctx.path,
            ctx.body,
            session.session.activeOrganizationId,
          );
      if (!organizationId) return;

      if (ctx.path !== '/organization/leave') {
        if (isLifecycleMutation) await requireOrganizationRbac(organizationId);
      }
      const actorRole = requiresActiveMembership
        ? await requireActiveOrganizationMember(session.user.id, organizationId)
        : ctx.path === '/organization/leave'
          ? (await requireOrganizationMember(session.user.id, organizationId)).role
          : undefined;
      if (ctx.path === '/organization/leave') {
        if (actorRole === 'owner') {
          throw new APIError('BAD_REQUEST', {
            code: 'SOLE_OWNER_CANNOT_LEAVE',
            message: 'Transfer ownership or delete the organization before leaving',
          });
        }
        await cancelPendingTransfersForParticipant({
          organizationId,
          participantUserId: session.user.id,
          actorUserId: session.user.id,
        });
      }
      if (
        ctx.path === '/organization/remove-member' &&
        (actorRole === 'owner' || actorRole === 'admin')
      ) {
        const target = await removedMember(ctx.body, organizationId);
        if (target && target.role !== 'owner') {
          await cancelPendingTransfersForParticipant({
            organizationId,
            participantUserId: target.userId,
            actorUserId: session.user.id,
          });
        }
      }
    }),
  },

  // ─── Session management ───────────────────────────────────────────────────
  // Rolling refresh: session lives 7 days; after 1 day of activity the expiry
  // is extended without requiring re-login.
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh expiry every 1 day of use
    cookieCache: {
      enabled: true,
      // Public API/web reads use the cache; protected API guards bypass it.
      maxAge: 5 * 60,
    },
  },

  // ─── Cookie attributes ────────────────────────────────────────────────────
  // better-auth automatically sets Secure when baseURL is HTTPS.
  // Production MUST use an HTTPS BETTER_AUTH_URL — no explicit flag needed.
  // httpOnly: true and sameSite: lax are better-auth defaults.
  user: {
    additionalFields: {
      // App-owned account lifecycle. input:false → clients can't set it on signup;
      // defaultValue keeps it present on the session user object.
      status: {
        type: [...ACCOUNT_STATUS_VALUES],
        required: false,
        input: false,
        defaultValue: 'pending',
      },
    },
  },

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { ...schema },
  }),

  emailAndPassword: {
    enabled: false,
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      const escapedName = escapeHtml(user.name ?? '');
      await sendEmail({
        to: user.email,
        subject: 'Verify your Tickif email',
        html: `
          <h2>Verify your email</h2>
          <p>Hi ${escapedName},</p>
          <p>Click the link below to verify your email address:</p>
          <p><a href="${url}">Verify Email</a></p>
          <p>— Tickif</p>
        `,
      });
    },
  },

  socialProviders,

  // Account linking: when a Google sign-in resolves a verified email that matches
  // an existing user, link rather than duplicate. Nested under `account` per the
  // better-auth options reference.
  //
  // We do NOT set trustedProviders — default verified-email linking is sufficient
  // since Google always verifies emails. trustedProviders would bypass the
  // emailVerified gate, which is unnecessary and a security risk (see better-auth
  // docs: "use with caution").
  account: {
    accountLinking: {
      enabled: true,
    },
  },

  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber: phone, code }) => {
        await enqueueSms({ phoneNumber: phone, code });
      },
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 3,
      signUpOnVerification: {
        // Derive a placeholder email until the designer completes their profile.
        getTempEmail: (phone) => `${phone}@phone.tickif.local`,
        getTempName: (phone) => phone,
      },
    }),
    // Platform RBAC: 4 roles (visitor/designer/admin/superadmin) live on user.role.
    // defaultRole keeps better-auth writing only our values; ac/roles define the four
    // roles so adminRoles validates at startup (rules/auth.md: adminRoles entries MUST
    // exist in roles). admin and superadmin both pass the /admin/* permission checks.
    // set-role still does no role-value validation upstream — the user_role pgEnum is
    // the write backstop (pinned by set-role.integration.test.ts).
    admin({
      defaultRole: PLATFORM_ROLE.VISITOR,
      ac,
      roles,
      adminRoles: [...ADMIN_PLATFORM_ROLES],
    }),
    organization({
      // Organization lifecycle is owned by the transactional designer onboarding
      // flow. Generic create/delete endpoints would allow profile-less orgs or
      // destructive deletion outside that workflow.
      allowUserToCreateOrganization: false,
      disableOrganizationDeletion: true,
      ac: orgAc,
      roles: orgRoles,
      creatorRole: 'owner',
      invitationExpiresIn: 7 * 24 * 60 * 60,
      cancelPendingInvitationsOnReInvite: true,
      membershipLimit: async (_user, organization) => organizationMembershipLimit(organization.id),
      teams: {
        enabled: true,
        defaultTeam: { enabled: true },
        maximumTeams: ({ organizationId }) => organizationBranchLimit(organizationId),
        allowRemovingAllTeams: false,
      },
      schema: {
        member: {
          additionalFields: {
            frozen: { type: 'boolean', required: false, defaultValue: false, input: false },
            frozenAt: { type: 'date', required: false, input: false },
            freezeRank: { type: 'number', required: false, input: false },
          },
        },
        team: {
          additionalFields: {
            frozen: { type: 'boolean', required: false, defaultValue: false, input: false },
            frozenAt: { type: 'date', required: false, input: false },
            freezeRank: { type: 'number', required: false, input: false },
          },
        },
      },
      sendInvitationEmail: async ({ id, email, organization, inviter }) => {
        const invitationUrl = new URL(
          `/invitations/${encodeURIComponent(id)}`,
          config.PUBLIC_WEB_URL,
        );
        await sendEmail({
          to: email,
          subject: "You're invited to a Tickif studio",
          html: `
            <h2>Join ${escapeHtml(organization.name)} on Tickif</h2>
            <p>${escapeHtml(inviter.user.name)} invited you to join their studio workspace.</p>
            <p><a href="${invitationUrl.toString()}">Accept invitation</a></p>
            <p>This invitation expires in 7 days.</p>
            <p>Tickif</p>
          `,
        });
      },
      organizationHooks: {
        beforeCreateTeam: async ({ team, user }) => {
          if (user) await requireActiveOrganizationMember(user.id, team.organizationId);
        },
        afterCreateTeam: async ({ team, user, organization }) => {
          try {
            const slug = await availableBranchSlug(team.name);
            await db.transaction(async (tx) => {
              if (user) {
                await tx
                  .insert(schema.teamMember)
                  .values({
                    id: crypto.randomUUID(),
                    teamId: team.id,
                    userId: user.id,
                    createdAt: new Date(),
                  })
                  .onConflictDoNothing();
              }
              await tx.insert(schema.designerProfile).values({
                orgId: organization.id,
                teamId: team.id,
                userId: user?.id ?? null,
                displayName: team.name,
                slug,
                entityType: 'company',
              });
            });
          } catch (error) {
            await db.delete(schema.team).where(eq(schema.team.id, team.id));
            throw error;
          }
        },
        beforeUpdateTeam: async ({ team, user }) => {
          await requireActiveOrganizationMember(user.id, team.organizationId);
          if (team.frozen) {
            throw new APIError('FORBIDDEN', {
              code: 'BRANCH_INACTIVE',
              message: 'Branch is inactive',
            });
          }
        },
        afterUpdateTeam: async ({ team }) => {
          if (!team) return;
          await db
            .update(schema.designerProfile)
            .set({ displayName: team.name, updatedAt: new Date() })
            .where(eq(schema.designerProfile.teamId, team.id));
        },
        beforeDeleteTeam: async ({ team, user }) => {
          if (user) await requireActiveOrganizationMember(user.id, team.organizationId);
          if (team.frozen) {
            throw new APIError('FORBIDDEN', {
              code: 'BRANCH_INACTIVE',
              message: 'Branch is inactive',
            });
          }
          throw new APIError('BAD_REQUEST', {
            code: 'BRANCH_DELETE_NOT_ALLOWED',
            message: 'Branch deletion is disabled because it would delete branch projects',
          });
        },
        beforeAddTeamMember: async ({ team }) => {
          await requireActiveTeam(team.id);
        },
        beforeRemoveTeamMember: async ({ team }) => {
          await requireActiveTeam(team.id);
        },
        beforeCreateInvitation: async ({ invitation, inviter }) => {
          await requireOrganizationRbac(invitation.organizationId);
          await requireActiveOrganizationMember(inviter.id, invitation.organizationId);
          const role = await validateOrganizationRoleChange({
            organizationId: invitation.organizationId,
            newRole: invitation.role,
          });
          if (role === 'owner') {
            throw new APIError('BAD_REQUEST', {
              code: 'OWNER_INVITATION_NOT_ALLOWED',
              message: 'Ownership must be transferred through an accepted transfer request',
            });
          }
          const teamIds = await activeInvitationTeamIds(invitation);
          if (!invitation.teamId) return { data: { teamIds } };
        },
        beforeUpdateMemberRole: async ({ member, newRole }) => {
          const role = await validateOrganizationRoleChange({
            organizationId: member.organizationId,
            newRole,
          });
          if (role === 'owner' || member.role === 'owner') {
            throw new APIError('BAD_REQUEST', {
              code: 'OWNER_TRANSFER_REQUIRED',
              message: 'Ownership changes require an accepted transfer request',
            });
          }
        },
        beforeAcceptInvitation: async ({ invitation }) => {
          await requireOrganizationRbac(invitation.organizationId);
          await activeInvitationTeamIds(invitation);
        },
        beforeRejectInvitation: async ({ invitation }) => {
          await requireOrganizationRbac(invitation.organizationId);
        },
        beforeCancelInvitation: async ({ invitation }) => {
          await requireOrganizationRbac(invitation.organizationId);
        },
        afterRejectInvitation: async ({ invitation, organization }) => {
          const [inviter] = await db
            .select({ email: schema.user.email, name: schema.user.name })
            .from(schema.user)
            .where(eq(schema.user.id, invitation.inviterId))
            .limit(1);
          if (!inviter) return;
          await sendEmail({
            to: inviter.email,
            subject: `Invitation to ${organization.name} declined`,
            idempotencyKey: `organization-invitation-declined-${invitation.id}`,
            html: `<p>${escapeHtml(invitation.email)} declined the invitation to ${escapeHtml(organization.name)}.</p>`,
          });
        },
        afterAcceptInvitation: async ({ invitation, user }) => {
          const teamIds = await activeInvitationTeamIds(invitation);
          await db.transaction(async (tx) => {
            await tx
              .insert(schema.teamMember)
              .values(
                teamIds.map((teamId) => ({
                  id: crypto.randomUUID(),
                  teamId,
                  userId: user.id,
                  createdAt: new Date(),
                })),
              )
              .onConflictDoNothing();
            await tx
              .update(schema.user)
              .set({ role: 'designer', status: 'active', updatedAt: new Date() })
              .where(
                and(
                  eq(schema.user.id, user.id),
                  or(eq(schema.user.role, 'visitor'), isNull(schema.user.role)),
                  inArray(schema.user.status, ['pending', 'active']),
                ),
              );
          });
        },
      },
    }),
    emailOTP({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 3,
      storeOTP: 'hashed',
      rateLimit: { window: 60, max: 3 },
      async sendVerificationOTP({ email, otp, type }) {
        const subject =
          type === 'sign-in'
            ? 'Your Tickif login code'
            : type === 'email-verification'
              ? 'Verify your Tickif email'
              : 'Reset your Tickif password';
        await sendEmail({
          to: email,
          subject,
          html: `
            <h2>${subject}</h2>
            <p>Your verification code is:</p>
            <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; margin: 16px 0;">${otp}</p>
            <p>This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
            <p>— Tickif</p>
          `,
        });
      },
    }),
  ],
});

export type Auth = typeof auth;
export type Session = Auth['$Infer']['Session'];
export type { PlatformRole } from './permissions.js';
export { organizationCapabilitiesForRole } from './permissions.js';
export { organizationMembershipLimit } from './organization-policy.js';

/**
 * Resolve the current better-auth session (user + session) from request headers, keeping
 * the response headers better-auth produced along the way.
 *
 * Those headers matter: on a read that reaches the database better-auth re-issues the
 * `session_data` cache cookie (and, when the session is gone, expires the session cookies).
 * A caller that drops them leaves the client holding its old — possibly stale — blob for the
 * rest of the ≤5-min TTL, so anything that forces a fresh read should forward these onward.
 *
 * `disableCookieCache` forces that fresh DB read instead of the ≤5-min cookie cache, so callers
 * that must see server-side revocation/expiry immediately (e.g. after logout, or before an
 * authorization decision) aren't served a stale cached copy.
 */
export async function getSessionWithHeaders(
  headers: Headers,
  opts?: { disableCookieCache?: boolean },
) {
  const { headers: responseHeaders, response } = await auth.api.getSession({
    headers,
    query: opts?.disableCookieCache ? { disableCookieCache: true } : undefined,
    returnHeaders: true,
  });
  return { session: response, headers: responseHeaders };
}

/**
 * Resolve the current better-auth session (user + session) from request headers.
 * Returns null when unauthenticated. The one place app code should read sessions.
 *
 * Discards better-auth's response headers — use `getSessionWithHeaders` when the refreshed
 * `session_data` cookie must reach the client.
 */
export async function getSession(headers: Headers, opts?: { disableCookieCache?: boolean }) {
  const { session } = await getSessionWithHeaders(headers, opts);
  return session;
}

/**
 * Select an authenticated user's active organization through better-auth so
 * membership is validated and both the session row and session cookie agree.
 */
export function setActiveOrganization(headers: Headers, organizationId: string) {
  return auth.api.setActiveOrganization({
    headers,
    body: { organizationId },
    asResponse: true,
  });
}

/** Select an authenticated user's active branch through Better Auth. */
export function setActiveTeam(headers: Headers, teamId: string) {
  return auth.api.setActiveTeam({ headers, body: { teamId }, asResponse: true });
}
