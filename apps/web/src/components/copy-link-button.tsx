'use client';

import { useState } from 'react';
import { Button } from '@repo/ui/components/button';
import { Check, Copy } from 'lucide-react';

export function CopyLinkButton({
  value,
  variant = 'outline',
  className,
}: {
  value: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link';
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

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
    <Button type="button" variant={variant} onClick={handleCopy} className={className}>
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}
