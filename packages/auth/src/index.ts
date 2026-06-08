import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { phoneNumber, admin, organization } from 'better-auth/plugins';
import { db, schema } from '@repo/db';
import { config, isProduction } from '@repo/config';

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
export const auth = betterAuth({
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.BETTER_AUTH_URL,

  // Trusted origins for cross-origin auth requests (web app on a different port/domain).
  // Driven by TRUSTED_ORIGINS env var — no hardcoded URLs.
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

  socialProviders:
    config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: config.GOOGLE_CLIENT_ID,
            clientSecret: config.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined,

  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber: phone, code }) => {
        if (!isProduction) {
          // Dev/test: log the OTP. Production wires this to MSG91.
          console.log(`[auth] OTP for ${phone}: ${code}`);
          return;
        }
        // TODO(phase-1): integrate MSG91 (config.MSG91_AUTH_KEY / SENDER_ID).
        throw new Error('SMS provider not configured');
      },
      signUpOnVerification: {
        // Derive a placeholder email until the designer completes their profile.
        getTempEmail: (phone) => `${phone}@phone.tickif.local`,
        getTempName: (phone) => phone,
      },
    }),
    // RBAC. Defaults give `admin` + `user` roles; the full 4-role model
    // (superadmin / admin / designer / visitor) is layered on via better-auth's
    // access-control (createAccessControl) in a later phase. The user.role
    // column already exists to store them.
    admin(),
    organization(),
  ],
});

export type Auth = typeof auth;
export type Session = Auth['$Infer']['Session'];

/**
 * Resolve the current better-auth session (user + session) from request headers.
 * Returns null when unauthenticated. The one place app code should read sessions.
 */
export function getSession(headers: Headers) {
  return auth.api.getSession({ headers });
}
