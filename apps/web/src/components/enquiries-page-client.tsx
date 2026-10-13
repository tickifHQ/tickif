'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DesignerLogoAvatar } from '@/components/designer-logo-avatar';
import { Circle, MessageSquare } from 'lucide-react';
import { listEnquiriesResponseSchema, type EnquiryResponse } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { EnquiryThread } from '@/components/enquiry-thread';
import { EnquiryProgress, enquiryReadThrough } from '@/components/enquiry-progress';
import { api } from '@/lib/api';
import { latestEnquiryReadWatermark } from '@/lib/enquiry-read-watermark';

export function EnquiriesPageClient() {
  const [enquiries, setEnquiries] = useState<EnquiryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState(false);
  const requested = useSearchParams().get('enquiryId');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    async function load() {
      try {
        const res = await api.api.enquiries.mine.$get(
          { query: { status: 'all', page, limit: 12 } },
          { init: { signal: controller.signal, cache: 'no-store' } },
        );
        if (!res.ok) throw new Error('Could not load enquiries');
        const parsed = listEnquiriesResponseSchema.safeParse(await res.json());
        if (!parsed.success) throw new Error('Invalid enquiries');
        if (controller.signal.aborted) return;
        setEnquiries(parsed.data.items);
        setTotalPages(parsed.data.totalPages);
        setSelectedId(
          (previous) =>
            parsed.data.items.find((item) => item.id === requested)?.id ??
            parsed.data.items.find((item) => item.id === previous)?.id ??
            parsed.data.items[0]?.id ??
            null,
        );
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [page, retry, requested]);

  const selected = enquiries.find((e) => e.id === selectedId) ?? null;
  const markRead = useCallback((id: string, through: string) => {
    const acknowledged = latestEnquiryReadWatermark([through]);
    if (!acknowledged) return;
    setEnquiries((items) =>
      items.map((item) => {
        if (item.id !== id || !item.activity?.isNew) return item;
        const loaded = latestEnquiryReadWatermark([enquiryReadThrough(item)]);
        // A delayed acknowledgement cannot clear a newer loaded update.
        if (!loaded || loaded > acknowledged) return item;
        return { ...item, activity: { ...item.activity, isNew: false } };
      }),
    );
  }, []);

  if (loading) {
    return (
      <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-[1512px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading your enquiries...</p>
      </div>
    );
  }

  if (error)
    return (
      <div role="status" className="mx-auto flex max-w-xl flex-col items-start gap-3 p-6">
        <p>Could not load your enquiries. Please try again.</p>
        <Button type="button" onClick={() => setRetry((value) => value + 1)}>
          Retry
        </Button>
      </div>
    );
  if (enquiries.length === 0) {
    return (
      <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-[1512px] flex-col items-center justify-center gap-3 px-6">
        <MessageSquare className="size-10 text-muted-foreground/50" />
        <p className="text-base font-medium text-foreground">No enquiries yet</p>
        <p className="text-sm text-muted-foreground">
          When you send an enquiry to a designer, it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] min-h-0 max-w-screen-2xl flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="max-h-60 w-full shrink-0 overflow-y-auto border-b border-border md:max-h-none md:w-80 md:border-b-0 md:border-r">
        <div className="px-4 py-4">
          <p className="font-mono text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Your Enquiries
          </p>
        </div>
        <div className="space-y-1 px-2">
          {enquiries.map((enquiry) => (
            <button
              key={enquiry.id}
              type="button"
              aria-pressed={selectedId === enquiry.id}
              onClick={() => setSelectedId(enquiry.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                selectedId === enquiry.id
                  ? 'bg-primary/5 border border-primary/20'
                  : 'hover:bg-accent'
              }`}
            >
              {/* Designer avatar */}
              <DesignerLogoAvatar
                logoUrl={enquiry.designerProfile.logoUrl}
                alt={`${enquiry.designerProfile.displayName} logo`}
                sizePx={40}
                className="size-10 text-xs bg-primary/10 font-bold text-primary"
                fallback={enquiry.designerProfile.displayName
                  .split(/\s+/)
                  .map((word) => word[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {enquiry.designerProfile.displayName}
                </p>
                {enquiry.designerProfile.location && (
                  <p className="truncate text-xs text-muted-foreground">
                    {enquiry.designerProfile.location}
                  </p>
                )}
              </div>
              {enquiry.activity?.isNew ? (
                <>
                  <Circle aria-hidden className="size-2 shrink-0 fill-primary text-primary" />
                  <span className="sr-only">Unread updates</span>
                </>
              ) : null}
            </button>
          ))}
        </div>
        <nav aria-label="Enquiry pages" className="flex gap-2 p-3">
          {page > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
          ) : null}
          {page < totalPages ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          ) : null}
        </nav>
      </aside>

      {/* Main content */}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
        {selected ? (
          <div className="mx-auto max-w-2xl">
            <EnquiryProgress enquiry={selected} />
            {/* Header */}
            <div className="mt-4 flex items-center gap-3">
              <DesignerLogoAvatar
                logoUrl={selected.designerProfile.logoUrl}
                alt={`${selected.designerProfile.displayName} logo`}
                sizePx={48}
                className="size-12 text-sm bg-primary/10 font-bold text-primary"
                fallback={selected.designerProfile.displayName
                  .split(/\s+/)
                  .map((word) => word[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              />
              <div>
                <p className="text-base font-medium text-foreground">
                  {selected.designerProfile.displayName}
                </p>
                {selected.designerProfile.location && (
                  <p className="text-sm text-muted-foreground">
                    {selected.designerProfile.location}
                  </p>
                )}
              </div>
            </div>

            <EnquiryThread
              key={selected.id}
              target={{ kind: 'visitor', id: selected.id }}
              readThrough={enquiryReadThrough(selected)}
              onRead={markRead}
            />
            {/* Enquiry details */}
            <div className="mt-6 space-y-4 rounded-xl border border-border p-5">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Subject</p>
                <p className="mt-1 text-sm text-foreground">{selected.subject}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Description</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {selected.description}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Budget</p>
                  <p className="mt-1 text-sm text-foreground">{selected.budget}</p>
                </div>
                {selected.timeline && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Timeline</p>
                    <p className="mt-1 text-sm text-foreground">{selected.timeline}</p>
                  </div>
                )}
              </div>
              {selected.referredProjectTitle && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Referred Project</p>
                  <p className="mt-1 text-sm text-foreground">{selected.referredProjectTitle}</p>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize">
                  {selected.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(selected.createdAt))}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Select an enquiry to view details</p>
          </div>
        )}
      </main>
    </div>
  );
}
