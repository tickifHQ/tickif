/**
 * Account identity helpers. Phone-auth users carry a generated internal
 * identifier that must never be presented as a real customer email address.
 */
const GENERATED_PHONE_EMAIL_SUFFIX = '@phone.tickif.local';

export function isGeneratedPhoneEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(GENERATED_PHONE_EMAIL_SUFFIX);
}

/** The email safe to display, or null when absent or generated (E-273). */
export function visibleAccountEmail(email: string | null | undefined): string | null {
  if (!email || isGeneratedPhoneEmail(email)) return null;
  return email;
}

/** Phone OTP creates a placeholder name equal to the sign-in number until onboarding. */
export function visibleAccountName(
  name: string | null | undefined,
  phoneNumber: string | null | undefined,
): string | null {
  const value = name?.trim();
  if (!value) return null;
  const phoneDigits = phoneNumber?.replace(/\D/g, '');
  if (phoneDigits && /^[+\d\s().-]+$/.test(value) && value.replace(/\D/g, '') === phoneDigits)
    return null;
  return value;
}
