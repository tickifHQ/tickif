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
    'studio\u0000name',
    'studio\u001fname',
    'studio\u007fname',
    'studio\\name',
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

  it.each([
    ['instagram', 'https://instagram.com/studio'],
    ['instagram', 'https://www.instagram.com/studio'],
    ['instagram', 'https://WWW.INSTAGRAM.COM/studio'],
    ['linkedin', 'https://linkedin.com/in/studio'],
    ['linkedin', 'https://www.linkedin.com/company/studio'],
    ['linkedin', 'https://uk.linkedin.com/in/studio'],
    ['youtube', 'https://youtube.com/@studio'],
    ['youtube', 'https://www.youtube.com/channel/UC123'],
    ['youtube', 'https://m.youtube.com/@studio'],
    ['youtube', 'http://youtube.com/user/legacy'],
  ] as const)(
    'accepts a %s destination on its canonical host or subdomain: %s',
    (platform, value) => {
      expect(socialProfileValueSchema(platform).safeParse(value).success).toBe(true);
    },
  );

  it.each([
    ['instagram', 'Instagram', 'https://example.com/studio'],
    ['instagram', 'Instagram', 'https://linkedin.com/in/studio'],
    ['instagram', 'Instagram', 'https://instagram.com.evil.test/studio'],
    ['instagram', 'Instagram', 'https://fakeinstagram.com/studio'],
    ['instagram', 'Instagram', 'https://evil.test/instagram.com/studio'],
    ['linkedin', 'LinkedIn', 'https://instagram.com/studio'],
    ['linkedin', 'LinkedIn', 'https://linkedin.com.evil.test/in/studio'],
    ['linkedin', 'LinkedIn', 'https://fakelinkedin.com/in/studio'],
    ['youtube', 'YouTube', 'https://instagram.com/studio'],
    ['youtube', 'YouTube', 'https://youtube.com.evil.test/@studio'],
    ['youtube', 'YouTube', 'https://fakeyoutube.com/@studio'],
  ] as const)(
    'rejects a wrong-platform %s edit with a precise %s error, preserving its legacy resolver: %s',
    (platform, label, value) => {
      const field = `${platform}Handle`;
      const article = platform === 'instagram' ? 'an' : 'a';
      const message = `Enter ${article} ${label} profile URL, or use your ${label} handle.`;
      const result = socialProfileValueSchema(platform).safeParse(value);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.message).toBe(message);
      expect(socialProfileHref(platform, value)).toBe(value);
      for (const schema of [updateProfileSchema, updatePortfolioSchema]) {
        const update = schema.safeParse({ [field]: value });
        expect(update.success).toBe(false);
        if (!update.success) {
          expect(update.error.issues).toEqual([
            expect.objectContaining({ path: [field], message }),
          ]);
        }
      }
      expect(
        onboardDesignerSchema.safeParse({
          entityType: 'individual',
          userName: 'Mahi',
          [field]: value,
        }).success,
      ).toBe(false);
      expect(onboardingDraftFieldsSchema.safeParse({ [field]: value }).success).toBe(true);
    },
  );

  it('keeps omitted social fields absent in unrelated edits', () => {
    for (const schema of [updateProfileSchema, updatePortfolioSchema]) {
      const result = schema.safeParse({ bio: 'Updated biography' });
      expect(result.success).toBe(true);
      if (result.success) {
        for (const field of ['instagramHandle', 'linkedinHandle', 'youtubeHandle']) {
          expect(result.data).not.toHaveProperty(field);
        }
      }
    }
  });

  it('keeps optional empty values and explicit removal valid without inventing a destination', () => {
    expect(socialProfileHref('youtube', '  ')).toBeNull();
    expect(socialProfileValueSchema('youtube').safeParse('  ').success).toBe(true);
    expect(updateProfileSchema.safeParse({ youtubeHandle: null }).success).toBe(true);
  });
});
