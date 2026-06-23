import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const PUBLIC_PATHS = new Set(['/', '/login', '/design-system']);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Optimistic only; requireAuth in the server layouts is the real security boundary.
  const hasSession = !!getSessionCookie(req);

  if (hasSession && pathname === '/login') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (!hasSession && !isPublic(pathname)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
