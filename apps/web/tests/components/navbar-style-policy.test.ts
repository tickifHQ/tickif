import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guard the requested source policy as well as the rendered geometry in Playwright.
describe('navbar style policy', () => {
  const pixelUtility = /\[[^\]\n]*\d(?:\.\d+)?px[^\]\n]*\]/g;
  it.each(['w-[72px]', 'h-[72px]', 'size-[15px]', 'text-[11px]'])('detects %s', (value) => {
    expect(value.match(pixelUtility)).toHaveLength(1);
  });
  it.each([
    'public-header',
    'public-navigation',
    'home-search-bar',
    'visitor-saved-count',
    'visitor-enquiry-count',
    'account-menu',
  ])('keeps literal pixel utilities out of %s', (component) => {
    const source = readFileSync(resolve('src/components', `${component}.tsx`), 'utf8');
    expect(source.match(pixelUtility) ?? []).toEqual([]);
  });
});
