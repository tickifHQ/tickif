import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { api } from '@/lib/api';

const PUBLIC_PATHS = new Set(['/', '/login', '/design-system', '/designers']);

/**
 * Route trees anonymous visitors may enter.
 *
 * `/d/` is the designer portfolio; `/projects/` is the public project detail
 * route it links to; `/image/` is the public image detail route. Gating these
 * sends visitors to a login wall mid-browse. These routes read published-only API projections
 * (`projectsService.gallery` and the portfolio read 404 anything unpublished),
 * so nothing here depends on the proxy for confidentiality.
 *
 * Trailing slashes are deliberate: they keep `/designer/...` from matching `/d/`
 * and any future `/projectsomething` from matching `/projects/`.
 */
const PUBLIC_PATH_PREFIXES = ['/d/', '/projects/', '/image/'] as const;

export function isPublicPath(pathname: string): boolean {
  const normalizedPathname =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.replace(/\/+$/, '') : pathname;
  return (
    PUBLIC_PATHS.has(normalizedPathname) ||
    PUBLIC_PATH_PREFIXES.some((prefix) => normalizedPathname.startsWith(prefix))
  );
}

const PUBLIC_PROJECT_PATH =
  /^\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i;

async function deletedProjectResponse(pathname: string): Promise<NextResponse | null> {
  const projectId = PUBLIC_PROJECT_PATH.exec(pathname)?.[1];
  if (!projectId) return null;

  try {
    const response = await api.api.projects.public[':id'].$head({ param: { id: projectId } });
    if (response.status !== 410) return null;
  } catch {
    // The page request remains the source of truth when the API probe is unavailable.
    return null;
  }

  return new NextResponse(
    '<!doctype html><title>Project gone</title><h1>Project no longer available</h1>',
    {
      status: 410,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex',
      },
    },
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const gone = await deletedProjectResponse(pathname);
  if (gone) return gone;

  // Optimistic only; requireAuth in the server layouts is the real security boundary.
  const hasSession = !!getSessionCookie(req);

  if (!hasSession && !isPublicPath(pathname)) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackURL', `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
