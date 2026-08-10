import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { phoneNumber, admin, organization, emailOTP } from 'better-auth/plugins';
import { ACCOUNT_STATUS_VALUES, ADMIN_PLATFORM_ROLES, PLATFORM_ROLE } from '@repo/contracts';
import { and, db, eq, inArray, isNull, or, schema } from '@repo/db';
import { config } from '@repo/config';
import { enqueueSms } from '@repo/queue';
import { ac, roles } from './permissions.js';
import { sendEmail } from './email.js';

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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

export const auth = betterAuth({
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.BETTER_AUTH_URL,

  // Trusted origins for cross-origin auth requests (web app on a different port/domain).
  // Driven by TRUSTED_ORIGINS env var — no hardcoded URLs.
  // Dev: "http://localhost:3000". Prod same-origin: leave empty.
  trustedOrigins: config.TRUSTED_ORIGINS,

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
            <p>This invitation expires in 48 hours.</p>
            <p>Tickif</p>
          `,
        });
      },
      organizationHooks: {
        afterAcceptInvitation: async ({ user }) => {
          await db
            .update(schema.user)
            .set({ role: 'designer', status: 'active', updatedAt: new Date() })
            .where(
              and(
                eq(schema.user.id, user.id),
                or(eq(schema.user.role, 'visitor'), isNull(schema.user.role)),
                inArray(schema.user.status, ['pending', 'active']),
              ),
            );
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
