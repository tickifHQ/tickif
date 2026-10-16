'use client';

import { useState } from 'react';
import type { PortfolioCompanyAbout } from '@repo/contracts';
import { Input } from '@repo/ui/components/input';
import { Textarea } from '@repo/ui/components/textarea';
import { Label } from '@repo/ui/components/label';
import { uploadPortfolioCover } from '@/lib/portfolio-api';

export function CompanyAboutEditor({
  value,
  onChange,
  founderPhotoUrl,
  studioPhotoUrl,
  onPhotoUploaded,
}: {
  value: PortfolioCompanyAbout;
  onChange: (value: PortfolioCompanyAbout) => void;
  founderPhotoUrl?: string | null;
  studioPhotoUrl?: string | null;
  onPhotoUploaded: (target: 'founder' | 'studio', url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File, target: 'founder' | 'studio') {
    setError(null);
    if (
      !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type) ||
      file.size > 10_000_000
    ) {
      setError('Choose a JPEG, PNG, WebP or AVIF image under 10 MB.');
      return;
    }
    setBusy(true);
    try {
      // Decode/re-encode to strip metadata and bound image dimensions before upload.
      const bitmap = await createImageBitmap(file);
      try {
        const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not prepare the company photo.');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (result) =>
              result ? resolve(result) : reject(new Error('Could not prepare the company photo.')),
            'image/webp',
            0.9,
          ),
        );
        const result = await uploadPortfolioCover(
          new File([blob], 'company-photo.webp', { type: 'image/webp' }),
          target,
        );
        onPhotoUploaded(target, result.heroCoverUrl);
      } finally {
        bitmap.close();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the company photo.');
    } finally {
      setBusy(false);
    }
  }
  const fields = [
    ['headline', 'Company headline', 80],
    ['founderName', 'Founder name', 100],
    ['founderRole', 'Founder role', 100],
    ['services', 'Services', 200],
    ['styles', 'Known for', 200],
    ['team', 'Team', 200],
    ['languages', 'Languages', 200],
  ] as const;
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Tell visitors about your company. Empty facts are hidden; cities come from your service
        locations. Photos save immediately.
      </p>
      {fields.map(([key, label, maxLength]) => (
        <div className="space-y-1.5" key={key}>
          <Label htmlFor={`company-${key}`}>{label}</Label>
          <Input
            id={`company-${key}`}
            maxLength={maxLength}
            value={value[key]}
            onChange={(event) => onChange({ ...value, [key]: event.target.value })}
          />
        </div>
      ))}
      <div className="space-y-1.5">
        <Label htmlFor="company-story">Company story</Label>
        <Textarea
          id="company-story"
          maxLength={450}
          rows={5}
          value={value.story}
          onChange={(event) => onChange({ ...value, story: event.target.value })}
          aria-describedby="company-story-help"
        />
        <p id="company-story-help" className="text-xs text-muted-foreground">
          {value.story.length}/450 characters. Leave empty to hide this section.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['founder', 'studio'] as const).map((target) => {
          const url = target === 'founder' ? founderPhotoUrl : studioPhotoUrl;
          return (
            <div className="space-y-2" key={target}>
              <Label htmlFor={`company-${target}-photo`}>
                {target === 'founder' ? 'Founder photo (optional)' : 'Studio photo (optional)'}
              </Label>
              {url ? (
                <img
                  src={url}
                  alt={`${target} photo preview`}
                  className="h-28 w-24 rounded-lg object-cover"
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {target === 'founder'
                    ? 'Uses initials when no photo is uploaded.'
                    : 'Uses the top published project cover when no photo is uploaded.'}
                </p>
              )}
              <Input
                id={`company-${target}-photo`}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void upload(file, target);
                }}
              />
            </div>
          );
        })}
      </div>
      {busy ? (
        <p role="status" className="text-sm text-muted-foreground">
          Uploading company photo…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
