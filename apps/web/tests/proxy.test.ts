import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { isDesignerPersonaPath, isPublicPath, proxy } from '../proxy';

describe('isPublicPath', () => {
  it('allows the directory without exposing similarly prefixed workspace routes', () => {
    expect(isPublicPath('/designers')).toBe(true);
    expect(isPublicPath('/designers/')).toBe(true);
    expect(isPublicPath('/designers-private')).toBe(false);
    expect(isPublicPath('/designer/dashboard')).toBe(false);
  });
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  it('allows the process-only container health endpoint', () => {
    expect(isPublicPath('/health')).toBe(true);
  });

  it('allows public designer profile routes', () => {
    expect(isPublicPath('/d/anika-spaces')).toBe(true);
  });

  it('allows the public project detail pages a portfolio links to', () => {
    // The portfolio grid links every card at /projects/{id}; gating this route
    // bounced anonymous visitors to /login the moment they clicked a project.
    expect(isPublicPath('/projects/11111111-1111-4111-8111-111111111111')).toBe(true);
  });

  it('allows public image detail pages', () => {
    expect(isPublicPath('/image/22222222-2222-4222-8222-222222222222')).toBe(true);
  });

  it('does not treat similarly prefixed protected routes as public', () => {
    expect(isPublicPath('/designer/dashboard')).toBe(false);
    expect(isPublicPath('/designer/projects')).toBe(false);
    expect(isPublicPath('/d')).toBe(false);
    expect(isPublicPath('/projects')).toBe(false);
    expect(isPublicPath('/image')).toBe(false);
  });

  it('keeps the rest of the workspace private', () => {
    expect(isPublicPath('/designer/portfolio')).toBe(false);
    expect(isPublicPath('/dashboard')).toBe(false);
    expect(isPublicPath('/moderation')).toBe(false);
    expect(isPublicPath('/onboarding')).toBe(false);
  });

  it('preserves the protected path and query when redirecting to login', async () => {
    const response = await proxy(
      new NextRequest('http://localhost:3000/enquiries?status=open&page=2'),
    );
    const location = response.headers.get('location');

    expect(response.status).toBe(307);
    if (!location) throw new Error('Expected proxy to provide a login redirect location.');
    expect(new URL(location).pathname).toBe('/login');
    expect(new URL(location).searchParams.get('callbackURL')).toBe('/enquiries?status=open&page=2');
  });

  it('preserves designer persona and callback for unauthenticated /designer/dashboard (E-272)', async () => {
    const response = await proxy(new NextRequest('http://localhost:3000/designer/dashboard'));
    const location = response.headers.get('location');

    expect(response.status).toBe(307);
    if (!location) throw new Error('Expected proxy to provide a login redirect location.');
    const url = new URL(location);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('mode')).toBe('designer');
    expect(url.searchParams.get('callbackURL')).toBe('/designer/dashboard');
  });

  it('preserves designer persona and callback for unauthenticated /designer/onboarding (E-272)', async () => {
    const response = await proxy(new NextRequest('http://localhost:3000/designer/onboarding'));
    const location = response.headers.get('location');

    expect(response.status).toBe(307);
    if (!location) throw new Error('Expected proxy to provide a login redirect location.');
    const url = new URL(location);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('mode')).toBe('designer');
    expect(url.searchParams.get('callbackURL')).toBe('/designer/onboarding');
  });

  it('keeps the designer persona and query intact for nested designer routes (E-272)', async () => {
    const response = await proxy(
      new NextRequest('http://localhost:3000/designer/projects?status=submitted'),
    );
    const location = response.headers.get('location');

    if (!location) throw new Error('Expected proxy to provide a login redirect location.');
    const url = new URL(location);
    expect(url.searchParams.get('mode')).toBe('designer');
    expect(url.searchParams.get('callbackURL')).toBe('/designer/projects?status=submitted');
  });

  it('does NOT apply designer persona to non-designer protected routes (E-272)', async () => {
    for (const path of ['/home', '/onboarding', '/dashboard', '/moderation']) {
      const response = await proxy(new NextRequest(`http://localhost:3000${path}`));
      const location = response.headers.get('location');

      if (!location) throw new Error(`Expected proxy to redirect ${path} to login.`);
      const url = new URL(location);
      expect(url.pathname).toBe('/login');
      expect(url.searchParams.get('mode')).toBeNull();
      expect(url.searchParams.get('callbackURL')).toBe(path);
    }
  });
});

describe('isDesignerPersonaPath', () => {
  it('matches designer workspace and onboarding routes', () => {
    expect(isDesignerPersonaPath('/designer/dashboard')).toBe(true);
    expect(isDesignerPersonaPath('/designer/onboarding')).toBe(true);
    expect(isDesignerPersonaPath('/designer/select-studio')).toBe(true);
    expect(isDesignerPersonaPath('/designer')).toBe(true);
  });

  it('does not match the public /designers directory or similarly prefixed routes', () => {
    expect(isDesignerPersonaPath('/designers')).toBe(false);
    expect(isDesignerPersonaPath('/designers/anika')).toBe(false);
    expect(isDesignerPersonaPath('/designerlike')).toBe(false);
  });

  it('does not match non-designer protected routes', () => {
    expect(isDesignerPersonaPath('/home')).toBe(false);
    expect(isDesignerPersonaPath('/onboarding')).toBe(false);
    expect(isDesignerPersonaPath('/dashboard')).toBe(false);
    expect(isDesignerPersonaPath('/moderation')).toBe(false);
  });

  it('returns 410 at the public Next.js URL when the API marks a project deleted', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 410 }));

    const response = await proxy(
      new NextRequest('http://localhost:3000/projects/77777777-7777-4777-8777-777777777777'),
    );

    expect(response.status).toBe(410);
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
  });

  it('continues to the page for public project URLs that are not permanently gone', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    const response = await proxy(
      new NextRequest('http://localhost:3000/projects/11111111-1111-4111-8111-111111111111'),
    );

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
