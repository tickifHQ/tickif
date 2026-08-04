'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  leadDetailResponseSchema,
  type LeadDetailResponse,
  type LeadStatus,
} from '@repo/contracts';
import { Avatar } from '@repo/ui/components/avatar';
import { Button } from '@repo/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@repo/ui/components/dialog';
import { SelectField } from '@repo/ui/components/select-field';
import { Textarea } from '@repo/ui/components/textarea';
import { ImagePlus, X } from 'lucide-react';
import { leadStatusOptions } from '@/components/designer-lead-status';
import { api } from '@/lib/api';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function formatBudget(slug: string | null): string {
  if (!slug) return 'Not added';
  const map: Record<string, string> = {
    'under-5l': '₹Under 5L',
    '5-10l': '₹5-10L',
    '10-20l': '₹10-20L',
    '20-50l': '₹20-50L',
    '50l-plus': '₹50L+',
    'prefer-not-to-say': 'Not disclosed',
  };
  return map[slug] ?? slug;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function statusLabel(status: LeadStatus) {
  if (status === 'contacted') return 'Marked as contacted';
  if (status === 'closed') return 'Marked as closed';
  if (status === 'spam') return 'Marked as spam';
  return 'New lead';
}

function DetailField({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 rounded-lg bg-muted/40 px-3 py-2.5 text-sm font-medium text-foreground">
        {value || 'Not added'}
      </dd>
    </div>
  );
}

export function DesignerLeadDetailDialog({
  lead,
  error,
}: {
  lead: LeadDetailResponse | null;
  error?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = Boolean(lead || error);
  const [selectedStatus, setSelectedStatus] = useState<LeadStatus>(lead?.status ?? 'new');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSelectedStatus(lead?.status ?? 'new');
    setSaveError(null);
  }, [lead]);

  function closeDialog() {
    const next = new URLSearchParams(searchParams);
    next.delete('leadId');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function saveLead() {
    if (!lead || selectedStatus === lead.status) return;
    setSaveError(null);
    startTransition(async () => {
      try {
        const response = await api.api.leads[':id'].$patch({
          param: { id: lead.id },
          json: { status: selectedStatus },
        });
        const payload: unknown = await response.json();
        const parsed = leadDetailResponseSchema.safeParse(payload);

        if (!response.ok || !parsed.success) {
          setSaveError('Could not save lead.');
          return;
        }

        router.refresh();
      } catch {
        setSaveError('Could not save lead.');
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeDialog();
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/25 backdrop-blur-sm"
        className="max-h-[calc(100vh-3rem)] gap-0 overflow-hidden rounded-2xl border-border p-0 sm:max-w-[43rem]"
      >
        <DialogTitle className="sr-only">Lead details</DialogTitle>
        <DialogDescription className="sr-only">
          View homeowner contact details, referred project, lead status, and notes.
        </DialogDescription>
        <div className="flex items-center justify-between px-6 pt-6">
          <div className="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Lead details
          </div>
          <button
            type="button"
            aria-label="Close lead details"
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={closeDialog}
          >
            <X className="size-4" />
          </button>
        </div>

        {lead ? (
          <>
            <div className="flex items-center gap-4 px-6 pt-5 pb-4">
              <Avatar className="size-12 bg-primary text-primary-foreground">
                <span className="flex size-full items-center justify-center text-sm font-bold">{initials(lead.name)}</span>
              </Avatar>
              <div className="min-w-0">
                <h2 className="truncate text-base font-medium text-foreground">{lead.name}</h2>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {lead.city ?? 'Location not added'}
                </p>
              </div>
            </div>

            <div className="max-h-[calc(100vh-15rem)] overflow-y-auto border-t border-border px-6 py-6">
              <dl className="grid gap-x-4 gap-y-4 sm:grid-cols-3">
                <DetailField label="Name" value={lead.name} />
                <DetailField label="Location" value={lead.city} />
                <DetailField label="Budget" value={formatBudget(lead.budgetBand)} />
                <DetailField label="Contact number" value={lead.contactNumber} />
                <DetailField label="Received on" value={formatDate(lead.receivedAt)} />
              </dl>

              <div className="mt-5">
                <div className="text-sm font-medium text-muted-foreground">Referred project</div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                    <ImagePlus className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-foreground">
                        {lead.referredProjectTitle ?? 'No project attached'}
                      </span>
                      {lead.referredProjectId ? (
                        <Link
                          href={`/designer/projects/${lead.referredProjectId}/edit`}
                          className="shrink-0 text-sm text-primary underline hover:text-primary/80"
                        >
                          View project
                        </Link>
                      ) : null}
                    </div>
                    <div className="mt-1 truncate text-sm text-muted-foreground">
                      {lead.city ?? 'Location not added'}
                    </div>
                  </div>
                </div>
              </div>

              <SelectField
                className="mt-6"
                label="Status"
                value={selectedStatus}
                onValueChange={(value) => setSelectedStatus(value as LeadStatus)}
                options={[
                  { value: 'new', label: statusLabel('new') },
                  ...leadStatusOptions.map((option) => ({
                    value: option.value,
                    label: statusLabel(option.value),
                  })),
                ]}
                placeholder="Select status"
              />

              <div className="mt-5">
                <label htmlFor="lead-notes" className="text-sm font-medium text-foreground">
                  Your notes
                </label>
                <Textarea
                  id="lead-notes"
                  readOnly
                  value={lead.message ?? ''}
                  placeholder="No notes added."
                  className="mt-2 min-h-28 resize-none bg-muted/30 text-muted-foreground"
                />
              </div>
              {saveError ? <p className="mt-3 text-sm text-destructive">{saveError}</p> : null}
            </div>
          </>
        ) : (
          <p className="mx-6 my-6 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? 'Could not load lead details.'}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-border bg-background px-6 py-4">
          <Button type="button" variant="outline" className="min-w-32" onClick={closeDialog}>
            Close
          </Button>
          <Button
            type="button"
            variant="inverted"
            className="min-w-32"
            disabled={!lead || selectedStatus === lead.status || isPending}
            onClick={saveLead}
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
