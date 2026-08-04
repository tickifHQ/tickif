import type { LeadStatus } from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import { cn } from '@repo/ui/lib/utils';

export const leadStatusOptions: Array<{ value: Exclude<LeadStatus, 'new'>; label: string }> = [
  { value: 'contacted', label: 'Mark as contacted' },
  { value: 'closed', label: 'Mark as closed' },
  { value: 'spam', label: 'Mark as spam' },
];

const leadStatusBadgeStyles: Record<LeadStatus, string> = {
  new: 'bg-muted text-muted-foreground',
  contacted: 'bg-warning/10 text-warning',
  closed: 'bg-success-lighter text-success',
  spam: 'bg-destructive/10 text-destructive',
};

export function leadStatusLabel(status: LeadStatus) {
  if (status === 'contacted') return 'Contacted';
  if (status === 'closed') return 'Closed';
  if (status === 'spam') return 'Spam';
  return 'New lead';
}

export function DesignerLeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-md border-transparent px-2 py-1 text-[13px] leading-[1.1] font-medium',
        leadStatusBadgeStyles[status],
      )}
    >
      {leadStatusLabel(status)}
    </Badge>
  );
}
