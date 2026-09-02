import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const designerRoutes = resolve(process.cwd(), 'app/(designer)/designer');

describe('designer overview loading boundaries', () => {
  it.each([
    {
      parent: 'projects/loading.tsx',
      overview: 'projects/(list)/loading.tsx',
    },
    {
      parent: 'plan-billing/loading.tsx',
      overview: 'plan-billing/(overview)/loading.tsx',
    },
  ])('scopes $parent to its URL-transparent overview route group', ({ parent, overview }) => {
    expect(existsSync(resolve(designerRoutes, parent))).toBe(false);
    expect(existsSync(resolve(designerRoutes, overview))).toBe(true);
  });
});
