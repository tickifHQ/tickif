'use client';

import { Copy } from 'lucide-react';

export function CopyButton({ value }: { value: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
      aria-label="Copy to clipboard"
      onClick={() => navigator.clipboard?.writeText(value)}
    >
      <Copy className="size-3.5" />
    </button>
  );
}
