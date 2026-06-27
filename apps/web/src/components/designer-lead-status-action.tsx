'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LeadStatus } from '@repo/contracts';
import { leadDetailResponseSchema } from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';

const statusOptions: Array<{ value: Exclude<LeadStatus, 'new'>; label: string }> = [
  { value: 'contacted', label: 'Mark as contacted' },
  { value: 'closed', label: 'Mark as closed' },
  { value: 'spam', label: 'Mark as spam' },
];

function actionForStatus(status: LeadStatus) {
  if (status === 'closed') {
    return { label: 'Mark as closed', variant: 'success' as const, icon: CheckCircle2 };
  }
  if (status === 'spam') {
    return { label: 'Mark as spam', variant: 'destructive' as const, icon: ShieldAlert };
  }
  return { label: 'Mark as contacted', variant: 'warning' as const, icon: AlertTriangle };
}

export function DesignerLeadStatusAction({
  leadId,
  status,
}: {
  leadId: string;
  status: LeadStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const action = actionForStatus(status);
  const Icon = action.icon;

  function updateStatus(nextStatus: Exclude<LeadStatus, 'new'>) {
    if (nextStatus === status) return;
    setError(null);
    startTransition(async () => {
      try {
        const response = await api.api.leads[':id'].$patch({
          param: { id: leadId },
          json: { status: nextStatus },
        });
        const payload: unknown = await response.json();
        const parsed = leadDetailResponseSchema.safeParse(payload);

        if (!response.ok || !parsed.success) {
          setError('Could not update lead.');
          return;
        }

        router.refresh();
      } catch {
        setError('Could not update lead.');
      }
    });
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger disabled={isPending} className="outline-none">
          <Badge variant={action.variant} className="rounded-md px-2 py-1 text-[13px]">
            <Icon className="size-3.5" />
            {action.label}
          </Badge>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          {statusOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              disabled={isPending || option.value === status}
              onSelect={() => updateStatus(option.value)}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <span className="text-xs text-destructive" role="status">
          {error}
        </span>
      ) : null}
    </div>
  );
}
