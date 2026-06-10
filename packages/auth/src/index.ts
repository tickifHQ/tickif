import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { phoneNumber, admin, organization } from 'better-auth/plugins';
import { db, schema } from '@repo/db';
import { config } from '@repo/config';
import { enqueueSms } from '@repo/queue';
import { ac, roles } from './permissions.js';

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
      maxAge: 5 * 60, // 5 min — avoids a DB hit on every getSession call
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
        type: ['pending', 'active', 'suspended', 'deleted'],
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
    admin({ defaultRole: 'visitor', ac, roles, adminRoles: ['admin', 'superadmin'] }),
    organization(),
  ],
});

export type Auth = typeof auth;
export type Session = Auth['$Infer']['Session'];

/**
 * Resolve the current better-auth session (user + session) from request headers.
 * Returns null when unauthenticated. The one place app code should read sessions.
 *
 * `disableCookieCache` forces a fresh DB read instead of the ≤5-min cookie cache, so callers
 * that must see server-side revocation/expiry immediately (e.g. after logout) aren't served a
 * stale cached copy.
 */
export function getSession(headers: Headers, opts?: { disableCookieCache?: boolean }) {
  return auth.api.getSession({
    headers,
    query: opts?.disableCookieCache ? { disableCookieCache: true } : undefined,
  });
}
