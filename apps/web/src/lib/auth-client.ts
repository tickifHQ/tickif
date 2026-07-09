import { createAuthClient } from 'better-auth/react';
import { phoneNumberClient, emailOTPClient } from 'better-auth/client/plugins';
import { env } from '@/env';

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_API_URL,
  plugins: [phoneNumberClient(), emailOTPClient()],
});
