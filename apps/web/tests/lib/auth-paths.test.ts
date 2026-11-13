import { describe, expect, it } from 'vitest';
import { callbackPathFromLoginHref, safeCallbackPath } from '@/lib/auth-paths';

const SITE = 'https://tickif.com';

function resolvedHost(path: string | undefined): string | undefined {
  return path === undefined ? undefined : new URL(path, SITE).host;
}

describe('safeCallbackPath', () => {
  it.each([
    ['/invitations/invitation-1', '/invitations/invitation-1'],
    ['/designer/projects?tab=drafts#top', '/designer/projects?tab=drafts#top'],
    ['/%2F%2Fevil.example', '/%2F%2Fevil.example'],
    ['/%09/evil.example', '/%09/evil.example'],
  ])('keeps the same-origin path %j', (value, expected) => {
    expect(safeCallbackPath(value)).toBe(expected);
    expect(resolvedHost(safeCallbackPath(value))).toBe('tickif.com');
  });

  it.each([
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    '/\r\n/evil.example',
    '/\t\\evil.example',
    '\t//evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/\\/evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    '\tjavascript:alert(1)',
    'java\tscript:alert(1)',
    'evil.example',
    '',
  ])('rejects %j, which a browser would navigate off-origin or treat as absolute', (value) => {
    expect(safeCallbackPath(value)).toBeUndefined();
  });

  it('returns the browser-visible path once control characters are stripped', () => {
    expect(safeCallbackPath('/designer/\tprojects')).toBe('/designer/projects');
  });

  it('uses the first value of a repeated query parameter', () => {
    expect(safeCallbackPath(['/\t/evil.example', '/home'])).toBeUndefined();
    expect(safeCallbackPath(['/home', '/\t/evil.example'])).toBe('/home');
  });
});

describe('callbackPathFromLoginHref', () => {
  it('rejects a login link whose callback decodes to a tab-split protocol-relative URL', () => {
    const href = `/login?callbackURL=${encodeURIComponent('/\t/evil.example')}`;
    expect(callbackPathFromLoginHref(href)).toBeUndefined();
  });

  it('keeps a same-origin callback from the login link', () => {
    expect(callbackPathFromLoginHref('/login?callbackURL=%2Fprojects%2Fp-1')).toBe('/projects/p-1');
  });
});
