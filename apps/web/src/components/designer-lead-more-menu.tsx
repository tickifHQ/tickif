'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { leadDetailResponseSchema, type LeadStatus } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { ArchiveX, CheckCircle2, Contact, MoreVertical } from 'lucide-react';
import { leadStatusOptions } from '@/components/designer-lead-status';
import { api } from '@/lib/api';

const leadStatusIcons: Record<Exclude<LeadStatus, 'new'>, typeof Contact> = {
  contacted: Contact,
  closed: CheckCircle2,
  spam: ArchiveX,
};

export function DesignerLeadMoreMenu({
  leadId,
  leadName,
  status,
}: {
  leadId: string;
  leadName: string;
  status: LeadStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
    <div className="inline-flex flex-col items-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`More actions for ${leadName}`}
            disabled={isPending}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {leadStatusOptions.map((option) => {
            const Icon = leadStatusIcons[option.value];
            return (
              <DropdownMenuItem
                key={option.value}
                disabled={isPending || option.value === status}
                onSelect={() => updateStatus(option.value)}
              >
                <Icon className="size-4" />
                {option.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <span className="sr-only" role="status">
          {error}
        </span>
      ) : null}
    </div>
  );
}
