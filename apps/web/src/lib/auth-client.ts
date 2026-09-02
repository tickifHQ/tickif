import { createAuthClient } from 'better-auth/react';
import { emailOTPClient, organizationClient, phoneNumberClient } from 'better-auth/client/plugins';
import { orgAc, orgRoles } from '@repo/auth/permissions';
import { env } from '@/env';

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_API_URL,
  plugins: [
    phoneNumberClient(),
    emailOTPClient(),
    organizationClient({ ac: orgAc, roles: orgRoles }),
  ],
});
