import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { phoneNumber, admin, organization } from 'better-auth/plugins';
import { db, schema } from '@repo/db';
import { config, isProduction } from '@repo/config';


const googleEnabled = Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);

if (!googleEnabled && (config.GOOGLE_CLIENT_ID || config.GOOGLE_CLIENT_SECRET)) {
  console.warn(
    '[auth] Incomplete Google OAuth configuration — both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required. Google provider disabled.',
  );
}

export const auth = betterAuth({
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.BETTER_AUTH_URL,

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

  socialProviders: googleEnabled
    ? {
        google: {
          clientId: config.GOOGLE_CLIENT_ID!,
          clientSecret: config.GOOGLE_CLIENT_SECRET!,
        },
      }
    : undefined,

  // Account linking: when a Google sign-in email matches an existing phone
  // user's email, link the accounts rather than creating a duplicate.
  // `trustedProviders` marks Google as a trusted email source so automatic
  // linking proceeds without an explicit user confirmation step.
  accountLinking: {
    enabled: true,
    trustedProviders: ['google'],
  },

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
