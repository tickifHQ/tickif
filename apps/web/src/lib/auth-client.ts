import { createAuthClient, type ReactAuthClient } from 'better-auth/react';
import { emailOTPClient, organizationClient, phoneNumberClient } from 'better-auth/client/plugins';
import { orgAc, orgRoles } from '@repo/auth/permissions';
import { env } from '@/env';

const organizationOptions = { ac: orgAc, roles: orgRoles, teams: { enabled: true } } as const;

type AuthClientOptions = {
  baseURL: string;
  plugins: [
    ReturnType<typeof phoneNumberClient>,
    ReturnType<typeof emailOTPClient>,
    ReturnType<typeof organizationClient<typeof organizationOptions>>,
  ];
};

const authClientOptions: AuthClientOptions = {
  baseURL: env.NEXT_PUBLIC_API_URL,
  plugins: [phoneNumberClient(), emailOTPClient(), organizationClient(organizationOptions)],
};

// Use Better Auth's public type so declaration inference does not expose internal atoms.
export const authClient: ReactAuthClient<AuthClientOptions> = createAuthClient(authClientOptions);
