import type { TickifEmail } from './email-templates.js';

/** Synthetic data only: safe for local previews and deterministic render tests. */
export const emailFixtures = [
  {
    kind: 'verify-email',
    name: 'Aarav',
    url: 'https://tickif.example/verify-email?token=sample&callbackURL=%2F',
  },
  { kind: 'otp', purpose: 'sign-in', code: '123456' },
  { kind: 'otp', purpose: 'email-verification', code: '234567' },
  { kind: 'otp', purpose: 'forget-password', code: '345678' },
  { kind: 'otp', purpose: 'change-email', code: '567890' },
  { kind: 'phone-otp', phoneNumber: '+919800000010', code: '456789' },
  {
    kind: 'invitation',
    organization: 'Studio Forma',
    inviter: 'Ananya Rao',
    url: 'https://tickif.example/invitations/sample',
  },
  { kind: 'invitation-declined', organization: 'Studio Forma', email: 'designer@example.com' },
  { kind: 'ownership-requested' },
  { kind: 'ownership-previous', newOwner: 'Ananya Rao' },
  { kind: 'ownership-new' },
  { kind: 'verification-approved' },
  {
    kind: 'verification-changes',
    note: 'Please upload a clearer copy of your registration document.\nAll four corners should be visible.',
  },
  {
    kind: 'verification-revoked',
    note: 'Your studio details have changed. Please review your documents.',
  },
] satisfies TickifEmail[];
