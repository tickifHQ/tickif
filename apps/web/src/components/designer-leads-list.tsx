import Link from 'next/link';
import type { LeadListStatus, ListLeadsResponse } from '@repo/contracts';
import { Avatar } from '@repo/ui/components/avatar';
import { Button } from '@repo/ui/components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/table';
import { ArrowDown, ExternalLink, MoreVertical } from 'lucide-react';
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

export function DesignerLeadsList({
  leads,
  activeStatus,
  query,
  error,
}: {
  leads: ListLeadsResponse;
  activeStatus: LeadListStatus;
  query?: string;
  error?: string;
}) {
  return (
    <div className="space-y-6 p-5">
      <DesignerListControls
        tabs={leadTabs.map((tab) => ({
          ...tab,
          count: tab.value === 'all' ? leads.total : undefined,
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
                        <Link href={`/designer/leads?leadId=${lead.id}`}>
                          <ExternalLink className="size-4" />
                        </Link>
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`More actions for ${lead.name}`}>
                        <MoreVertical className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-14 text-center">
                  <div className="mx-auto max-w-sm space-y-2">
                    <h2 className="text-sm font-medium text-foreground">No leads found</h2>
                    <p className="text-sm text-muted-foreground">
                      {query ? 'Try a different search or clear the filter.' : 'New leads will appear here when homeowners enquire.'}
                    </p>
                  </div>
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
    </div>
  );
}
