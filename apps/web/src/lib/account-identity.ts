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
