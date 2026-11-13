export const ADMIN_DASHBOARD_PATH = '/dashboard';
export const DESIGNER_AUTH_CONTINUE_PATH = '/login?mode=designer&authenticated=1';
export const VISITOR_AUTH_CONTINUE_PATH = '/login?mode=browsing&authenticated=1';
export const DESIGNER_ONBOARDING_DEFERRED_PATH = '/designer/onboarding/deferred';
export const REQUEST_PATH_HEADER = 'x-tickif-request-path';

export function designerLoginPath(callbackPath: string): string {
  const params = new URLSearchParams({ mode: 'designer', callbackURL: callbackPath });
  return `/login?${params.toString()}`;
}

const CALLBACK_BASE = 'https://tickif.local';
// Browsers drop tab, CR and LF while parsing a URL, so "/\t/evil.example" navigates
// to //evil.example. Strip control characters the same way before checking the origin.
// eslint-disable-next-line no-control-regex -- matching control characters is the point.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/** Returns a same-origin path (with query and hash) or undefined for anything else. */
export function safeCallbackPath(value: string | string[] | null | undefined): string | undefined {
  const candidate = (Array.isArray(value) ? value[0] : value)?.replace(CONTROL_CHARACTERS, '');
  if (!candidate?.startsWith('/')) return undefined;
  const url = parseUrl(candidate);
  if (url?.origin !== CALLBACK_BASE) return undefined;
  const path = `${url.pathname}${url.search}${url.hash}`;
  // Dot segments can normalize "/.//evil.example" into "//evil.example"; the path we
  // hand back must itself stay on this origin.
  return parseUrl(path)?.origin === CALLBACK_BASE ? path : undefined;
}

export function callbackPathFromLoginHref(loginHref: string): string | undefined {
  const loginUrl = parseUrl(loginHref);
  if (loginUrl?.origin !== CALLBACK_BASE || loginUrl.pathname !== '/login') {
    return undefined;
  }
  return (
    safeCallbackPath(loginUrl.searchParams.get('callbackURL')) ??
    safeCallbackPath(loginUrl.searchParams.get('next'))
  );
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value, CALLBACK_BASE);
  } catch {
    return undefined;
  }
}
