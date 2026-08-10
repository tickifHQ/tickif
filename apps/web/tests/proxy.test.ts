import { describe, expect, it } from 'vitest';
import { isPublicPath } from '../proxy';

describe('isPublicPath', () => {
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
});
