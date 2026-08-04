export const VISITOR_ONBOARDING_STORAGE_KEY = 'tickif.visitorOnboarding';
export const VISITOR_ONBOARDED_COOKIE = 'tickif_visitor_onboarded';

const VISITOR_ONBOARDING_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type VisitorOnboardingPreferences = {
  displayName: string;
  address: string;
  phoneNumber: string;
  whatsapp: string;
};

export function hasCompletedVisitorOnboarding() {
  if (typeof document === 'undefined') return false;

  try {
    const hasCookie = document.cookie
      .split(';')
      .some((cookie) => cookie.trim().startsWith(`${VISITOR_ONBOARDED_COOKIE}=`));
    return hasCookie || window.localStorage.getItem(VISITOR_ONBOARDING_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveVisitorOnboardingPreferences(preferences: VisitorOnboardingPreferences) {
  window.localStorage.setItem(VISITOR_ONBOARDING_STORAGE_KEY, JSON.stringify(preferences));
  document.cookie = `${VISITOR_ONBOARDED_COOKIE}=1; Path=/; Max-Age=${VISITOR_ONBOARDING_COOKIE_MAX_AGE}; SameSite=Lax`;
}
