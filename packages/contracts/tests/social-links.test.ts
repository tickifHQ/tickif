import { describe, expect, it } from 'vitest';
import { socialProfileHref, socialProfileValueSchema } from '../src/social-links';
import {
  onboardDesignerSchema,
  onboardingDraftFieldsSchema,
  updateProfileSchema,
  updatePortfolioSchema,
} from '../src/profiles';

describe('social profile confirmation', () => {
  it.each([
    ['instagram', ' @mahi.studio ', 'https://www.instagram.com/mahi.studio'],
    ['linkedin', '/company/mahi-studio', 'https://www.linkedin.com/company/mahi-studio'],
    ['linkedin', 'mahi-studio', 'https://www.linkedin.com/in/mahi-studio'],
    ['youtube', '@mahi-studio', 'https://www.youtube.com/@mahi-studio'],
    ['youtube', 'channel/UC123', 'https://www.youtube.com/channel/UC123'],
    ['instagram', 'https://instagram.com/mahi.studio', 'https://instagram.com/mahi.studio'],
  ] as const)('resolves %s input %s into the public destination', (platform, value, href) => {
    expect(socialProfileValueSchema(platform).safeParse(value).success).toBe(true);
    expect(socialProfileHref(platform, value)).toBe(href);
  });

  it.each([
    'javascript:alert(1)',
    'https://',
    '@',
    'two handles',
    'https://user:secret@instagram.com/studio',
    '//evil.test/@studio',
    'studio?redirect=evil',
  ])('rejects invalid value %s before onboarding or profile update', (value) => {
    expect(socialProfileHref('instagram', value)).toBeNull();
    expect(socialProfileValueSchema('instagram').safeParse(value).success).toBe(false);
    expect(
      onboardDesignerSchema.safeParse({
        entityType: 'individual',
        userName: 'Mahi',
        instagramHandle: value,
      }).success,
    ).toBe(false);
    expect(updateProfileSchema.safeParse({ instagramHandle: value }).success).toBe(false);
  });

  it.each(['instagram', 'linkedin', 'youtube'] as const)(
    'shares %s validation across all edit paths while drafts keep unfinished input',
    (platform) => {
      const field = `${platform}Handle`;
      expect(updateProfileSchema.safeParse({ [field]: 'javascript:alert(1)' }).success).toBe(false);
      expect(updatePortfolioSchema.safeParse({ [field]: 'javascript:alert(1)' }).success).toBe(
        false,
      );
      expect(
        onboardDesignerSchema.safeParse({
          entityType: 'individual',
          userName: 'Mahi',
          [field]: '@',
        }).success,
      ).toBe(false);
      expect(onboardingDraftFieldsSchema.safeParse({ [field]: '@' }).success).toBe(true);
      expect(updateProfileSchema.safeParse({ [field]: null }).success).toBe(true);
      expect(updatePortfolioSchema.safeParse({ [field]: null }).success).toBe(true);
    },
  );

  it('preserves existing full HTTP URLs and Unicode handles', () => {
    expect(socialProfileHref('youtube', 'http://youtube.com/user/legacy')).toBe(
      'http://youtube.com/user/legacy',
    );
    expect(socialProfileHref('linkedin', 'https://example.com/team/profile')).toBe(
      'https://example.com/team/profile',
    );
    expect(socialProfileHref('youtube', '@caf\u00e9')).toBe('https://www.youtube.com/@caf%C3%A9');
  });

  it('keeps optional empty values and explicit removal valid without inventing a destination', () => {
    expect(socialProfileHref('youtube', '  ')).toBeNull();
    expect(socialProfileValueSchema('youtube').safeParse('  ').success).toBe(true);
    expect(updateProfileSchema.safeParse({ youtubeHandle: null }).success).toBe(true);
  });
});
