import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { phoneNumber, admin, organization } from 'better-auth/plugins';
import { db, schema } from '@repo/db';
import { config } from '@repo/config';
import { enqueueSms } from '@repo/queue';

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

  // Driven by TRUSTED_ORIGINS env var — no hardcoded URLs.
  // Dev: "http://localhost:3000". Prod same-origin: leave empty.
  trustedOrigins: config.TRUSTED_ORIGINS,

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
