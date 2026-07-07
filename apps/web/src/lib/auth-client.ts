import { createAuthClient } from 'better-auth/react';
import { phoneNumberClient, emailOTPClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  plugins: [phoneNumberClient(), emailOTPClient()],
});
