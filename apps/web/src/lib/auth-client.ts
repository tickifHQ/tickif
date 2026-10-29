import { createAuthClient, type ReactAuthClient } from 'better-auth/react';
import {
  emailOTPClient,
  oneTapClient,
  organizationClient,
  phoneNumberClient,
} from 'better-auth/client/plugins';
import { orgAc, orgRoles } from '@repo/auth/permissions';
import { env } from '@/env';

const organizationOptions = { ac: orgAc, roles: orgRoles, teams: { enabled: true } } as const;

type AuthClientOptions = {
  baseURL: string;
  plugins: [
    ReturnType<typeof phoneNumberClient>,
    ReturnType<typeof emailOTPClient>,
    ReturnType<typeof organizationClient<typeof organizationOptions>>,
    ReturnType<typeof oneTapClient>,
  ];
};

const authClientOptions: AuthClientOptions = {
  baseURL: env.NEXT_PUBLIC_API_URL,
  plugins: [
    phoneNumberClient(),
    emailOTPClient(),
    organizationClient(organizationOptions),
    // GoogleOneTap only calls this when the client id is configured. No re-prompting:
    // under FedCM a closed prompt and a failed one look the same.
    oneTapClient({
      clientId: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
      promptOptions: { maxAttempts: 0 },
    }),
  ],
};

// Use Better Auth's public type so declaration inference does not expose internal atoms.
export const authClient: ReactAuthClient<AuthClientOptions> = createAuthClient(authClientOptions);
