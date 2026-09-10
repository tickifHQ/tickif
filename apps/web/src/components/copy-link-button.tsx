'use client';

import { useState } from 'react';
import { Button } from '@repo/ui/components/button';
import { Check, Copy, Share2 } from 'lucide-react';

export function CopyLinkButton({
  value,
  variant = 'outline',
  size,
  className,
  label = 'Copy link',
  icon = 'copy',
}: {
  value: string;
  variant?: 'default' | 'emphasis' | 'outline' | 'secondary' | 'ghost' | 'link' | 'fancy';
  size?: 'default' | 'compact' | 'fancy' | 'sm' | 'xs' | 'lg' | 'icon';
  className?: string;
  label?: string;
  icon?: 'copy' | 'share';
}) {
  const [copied, setCopied] = useState(false);
  const IdleIcon = icon === 'share' ? Share2 : Copy;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={handleCopy} className={className}>
      {copied ? <Check className="size-4" /> : <IdleIcon className="size-4" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}
