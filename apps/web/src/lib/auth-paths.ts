export const ADMIN_DASHBOARD_PATH = '/dashboard';
export const DESIGNER_AUTH_CONTINUE_PATH = '/login?mode=designer&authenticated=1';
export const VISITOR_AUTH_CONTINUE_PATH = '/login?mode=browsing&authenticated=1';
export const DESIGNER_ONBOARDING_DEFERRED_PATH = '/designer/onboarding/deferred';

export function safeCallbackPath(value: string | string[] | null | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate?.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return undefined;
  }
  return candidate;
}

export function callbackPathFromLoginHref(loginHref: string): string | undefined {
  try {
    const loginUrl = new URL(loginHref, 'https://tickif.local');
    if (loginUrl.origin !== 'https://tickif.local' || loginUrl.pathname !== '/login') {
      return undefined;
    }
    return (
      safeCallbackPath(loginUrl.searchParams.get('callbackURL')) ??
      safeCallbackPath(loginUrl.searchParams.get('next'))
    );
  } catch {
    return undefined;
  }
}
