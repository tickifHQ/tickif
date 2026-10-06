import { socialProfileHref, socialProfileValueSchema, type SocialPlatform } from '@repo/contracts';
import { ExternalLink } from 'lucide-react';

const schemas = {
  instagram: socialProfileValueSchema('instagram'),
  linkedin: socialProfileValueSchema('linkedin'),
  youtube: socialProfileValueSchema('youtube'),
};
const names = { instagram: 'Instagram', linkedin: 'LinkedIn', youtube: 'YouTube' };

export function socialProfileError(platform: SocialPlatform, value: string): string | undefined {
  const result = schemas[platform].safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

/** Confirmation uses the same resolver as the saved public portfolio links. */
export function SocialProfileConfirmation({
  id,
  platform,
  value,
  showError = true,
}: {
  id: string;
  platform: SocialPlatform;
  value: string;
  showError?: boolean;
}) {
  const error = socialProfileError(platform, value);
  const href = error ? null : socialProfileHref(platform, value);
  return (
    <div id={id} className="min-w-0 space-y-1 text-xs text-muted-foreground" aria-live="polite">
      {error ? (
        showError ? (
          <p className="text-destructive">{error}</p>
        ) : null
      ) : href ? (
        <>
          <p className="break-all">{href}</p>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Open ${names[platform]} profile (opens in a new tab)`}
          >
            Open profile <ExternalLink className="size-3" aria-hidden="true" />
          </a>
          <p>Check that this opens your profile before saving.</p>
        </>
      ) : (
        <p>Optional. Leave blank to hide this link.</p>
      )}
    </div>
  );
}
