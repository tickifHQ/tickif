import Link from 'next/link';
import type { LeadDetailResponse, LeadListStatus, ListLeadsResponse } from '@repo/contracts';
import { Avatar } from '@repo/ui/components/avatar';
import { Button } from '@repo/ui/components/button';
import { EmptyState } from '@repo/ui/components/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/table';
import { ArrowDown, ExternalLink, UsersRound } from 'lucide-react';
import { DesignerLeadDetailDialog } from '@/components/designer-lead-detail-dialog';
import { DesignerLeadMoreMenu } from '@/components/designer-lead-more-menu';
import { DesignerLeadStatusAction } from '@/components/designer-lead-status-action';
import { DesignerListControls, type DesignerListTab } from '@/components/designer-list-controls';
import { DesignerListPagination } from '@/components/designer-list-pagination';

const leadTabs: Array<DesignerListTab<LeadListStatus>> = [
  { value: 'all', label: 'All' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'closed', label: 'Closed' },
  { value: 'spam', label: 'Spam' },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function leadDetailHref({
  leadId,
  activeStatus,
  query,
  page,
  limit,
}: {
  leadId: string;
  activeStatus: LeadListStatus;
  query?: string;
  page: number;
  limit: number;
}) {
  const params = new URLSearchParams();
  if (activeStatus !== 'all') params.set('status', activeStatus);
  if (query) params.set('q', query);
  if (page > 1) params.set('page', String(page));
  if (limit !== 12) params.set('limit', String(limit));
  params.set('leadId', leadId);
  return `/designer/leads?${params.toString()}`;
}

export function DesignerLeadsList({
  leads,
  tabCounts,
  selectedLead,
  selectedLeadError,
  activeStatus,
  query,
  error,
}: {
  leads: ListLeadsResponse;
  tabCounts?: Partial<Record<LeadListStatus, number>>;
  selectedLead?: LeadDetailResponse | null;
  selectedLeadError?: string;
  activeStatus: LeadListStatus;
  query?: string;
  error?: string;
}) {
  return (
    <div className="space-y-6 p-5">
      <DesignerListControls
        tabs={leadTabs.map((tab) => ({
          ...tab,
          count: tabCounts?.[tab.value] ?? (tab.value === activeStatus ? leads.total : undefined),
        }))}
        activeTab={activeStatus}
        searchValue={query}
      />

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg">
        <Table className="min-w-[70rem]">
          <TableHeader>
            <TableRow className="border-0 bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[15.625rem] rounded-l-lg">
                <span className="inline-flex items-center gap-1">
                  Lead
                  <ArrowDown className="size-4" />
                </span>
              </TableHead>
              <TableHead className="w-60">Referred project</TableHead>
              <TableHead className="w-48">Contact number</TableHead>
              <TableHead className="w-28">Budget</TableHead>
              <TableHead className="w-36">Received on</TableHead>
              <TableHead className="w-44">Response</TableHead>
              <TableHead className="w-20 rounded-r-lg text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.items.length > 0 ? (
              leads.items.map((lead) => (
                <TableRow key={lead.id} className="hover:bg-transparent">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8 bg-primary text-primary-foreground">
                        <span className="text-xs font-bold">{initials(lead.name)}</span>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{lead.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{lead.city ?? 'City not added'}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium text-muted-foreground">
                    {lead.referredProjectTitle ?? 'No project attached'}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-muted-foreground">{lead.contactNumber}</TableCell>
                  <TableCell className="text-[13px] font-medium text-muted-foreground">{lead.budgetBand ?? 'Not added'}</TableCell>
                  <TableCell className="text-sm font-medium text-muted-foreground">{formatDate(lead.receivedAt)}</TableCell>
                  <TableCell>
                    <DesignerLeadStatusAction leadId={lead.id} status={lead.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild variant="ghost" size="icon" className="size-8" aria-label={`Open ${lead.name} lead`}>
                        <Link href={leadDetailHref({
                          leadId: lead.id,
                          activeStatus,
                          query,
                          page: leads.page,
                          limit: leads.limit,
                        })}>
                          <ExternalLink className="size-4" />
                        </Link>
                      </Button>
                      <DesignerLeadMoreMenu leadId={lead.id} leadName={lead.name} status={lead.status} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-14 text-center">
                  <EmptyState
                    icon={<UsersRound className="size-5" />}
                    title="No leads found"
                    description={query ? 'Try a different search or clear the filter.' : 'New leads will appear here when homeowners enquire.'}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DesignerListPagination
        page={leads.page}
        totalPages={leads.totalPages}
        total={leads.total}
        limit={leads.limit}
        className={leads.items.length === 0 ? 'opacity-70' : undefined}
      />
      <DesignerLeadDetailDialog lead={selectedLead ?? null} error={selectedLeadError} />
    </div>
  );
}
