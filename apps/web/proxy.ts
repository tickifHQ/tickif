import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const PUBLIC_PATHS = new Set(['/', '/login', '/design-system']);

/**
 * Route trees anonymous visitors may enter.
 *
 * `/d/` is the designer portfolio; `/projects/` is the public project detail
 * page it links to — the two are one journey, so gating either sends visitors to
 * a login wall mid-browse. Both read published-only API projections
 * (`projectsService.gallery` and the portfolio read 404 anything unpublished),
 * so nothing here depends on the proxy for confidentiality.
 *
 * Trailing slashes are deliberate: they keep `/designer/...` from matching `/d/`
 * and any future `/projectsomething` from matching `/projects/`.
 */
const PUBLIC_PATH_PREFIXES = ['/d/', '/projects/'] as const;

export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Optimistic only; requireAuth in the server layouts is the real security boundary.
  const hasSession = !!getSessionCookie(req);

  if (!hasSession && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
