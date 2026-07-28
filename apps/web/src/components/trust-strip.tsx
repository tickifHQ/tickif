import type { LucideIcon } from 'lucide-react';
import { Check, Shield, Sparkle } from 'lucide-react';

export type TrustStripItem = {
  icon: LucideIcon;
  label: string;
};

const defaultItems = [
  { icon: Check, label: '12,400+ real homes, fully verified' },
  { icon: Shield, label: 'Talk directly to the designers' },
  { icon: Sparkle, label: 'No commissions · No middlemen' },
] satisfies TrustStripItem[];

export function TrustStrip({ items = defaultItems }: { items?: readonly TrustStripItem[] }) {
  return (
    <div className="bg-surface-inverse px-4 py-2 text-surface-inverse-foreground">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs">
        {items.map(({ icon: Icon, label }) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <Icon className="size-3" aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
