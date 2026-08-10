import { describe, expect, it } from 'vitest';
import { discoveryFeedQuerySchema } from '../src/discovery.js';

describe('discoveryFeedQuerySchema', () => {
  it('accepts bounded taxonomy slug arrays', () => {
    expect(
      discoveryFeedQuerySchema.safeParse({
        citySlug: ['mumbai', 'pune'],
        roomSlugs: 'living-room',
      }).success,
    ).toBe(true);
  });

  it('rejects malformed taxonomy slugs consistently with the project feed', () => {
    expect(discoveryFeedQuerySchema.safeParse({ citySlug: 'Mumbai!' }).success).toBe(false);
    expect(discoveryFeedQuerySchema.safeParse({ themes: ['modern', 'not valid'] }).success).toBe(
      false,
    );
  });
});
