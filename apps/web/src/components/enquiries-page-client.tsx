'use client';

import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import type { EnquiryResponse, ListEnquiriesResponse } from '@repo/contracts';
import { api } from '@/lib/api';

export function EnquiriesPageClient() {
  const [enquiries, setEnquiries] = useState<EnquiryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.api.enquiries.mine.$get({ query: { status: 'all' } });
        if (res.ok) {
          const data: ListEnquiriesResponse = await res.json();
          setEnquiries(data.items);
          if (data.items.length > 0 && !selectedId) {
            setSelectedId(data.items[0]!.id);
          }
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const selected = enquiries.find((e) => e.id === selectedId) ?? null;

  if (loading) {
    return (
      <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-[1512px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading your enquiries...</p>
      </div>
    );
  }

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
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-[1512px]">
      {/* Sidebar */}
      <aside className="w-80 shrink-0 overflow-y-auto border-r border-border">
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
              onClick={() => setSelectedId(enquiry.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                selectedId === enquiry.id
                  ? 'bg-primary/5 border border-primary/20'
                  : 'hover:bg-accent'
              }`}
            >
              {/* Designer avatar */}
              {enquiry.designerProfile.logoUrl ? (
                <img
                  src={enquiry.designerProfile.logoUrl}
                  alt=""
                  className="size-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {enquiry.designerProfile.displayName
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
              )}
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
            </button>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-8">
        {selected ? (
          <div className="mx-auto max-w-2xl">
            {/* Header */}
            <div className="flex items-center gap-3">
              {selected.designerProfile.logoUrl ? (
                <img
                  src={selected.designerProfile.logoUrl}
                  alt=""
                  className="size-12 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {selected.designerProfile.displayName
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-base font-medium text-foreground">
                  {selected.designerProfile.displayName}
                </p>
                {selected.designerProfile.location && (
                  <p className="text-sm text-muted-foreground">{selected.designerProfile.location}</p>
                )}
              </div>
            </div>

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
