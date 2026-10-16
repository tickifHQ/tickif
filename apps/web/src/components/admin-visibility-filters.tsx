import type { AdminReportQuery } from '@repo/contracts';
import Link from 'next/link';
import { adminReportWindow } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { AdminCompanyFilter } from '@/components/admin-company-filter';
import { adminVisibilityHref } from '@/lib/admin-visibility-api';

export function AdminVisibilityFilters({
  action,
  query,
  companyName,
  leads = false,
  groupBy,
}: {
  action: string;
  query: AdminReportQuery & { q?: string; status?: string };
  companyName?: string;
  leads?: boolean;
  groupBy?: string;
}) {
  const window = adminReportWindow(query);
  // URL-driven drill-downs must reset uncontrolled fields to the committed filters.
  const filterKey = JSON.stringify([
    action,
    window.from,
    window.to,
    query.organizationId,
    query.designerId,
    query.q,
    query.status,
    groupBy,
  ]);
  return (
    <form
      key={filterKey}
      action={action}
      method="get"
      className="grid items-end gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div className="space-y-2">
        <Label htmlFor="admin-from">From (India time)</Label>
        <Input id="admin-from" name="from" type="date" required defaultValue={window.from} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="admin-to">To (inclusive)</Label>
        <Input id="admin-to" name="to" type="date" required defaultValue={window.to} />
      </div>
      <AdminCompanyFilter
        key={`${query.organizationId ?? 'all'}-${query.designerId ?? ''}`}
        value={query.organizationId}
        name={companyName}
        designerId={query.designerId}
      />
      <div className="space-y-2">
        <Label htmlFor="admin-search">
          {leads ? 'Search leads' : 'Search companies / designers'}
        </Label>
        <Input
          id="admin-search"
          name="q"
          maxLength={120}
          defaultValue={query.q}
          placeholder={leads ? 'Name, phone, project or subject' : 'Name'}
        />
      </div>
      {leads ? (
        <div className="space-y-2">
          <Label htmlFor="admin-status">Lead stage</Label>
          <select
            id="admin-status"
            name="status"
            defaultValue={query.status ?? ''}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All stages</option>
            {['new', 'contacted', 'closed', 'spam'].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="admin-group">Compare</Label>
          <select
            id="admin-group"
            name="groupBy"
            defaultValue={groupBy ?? 'company'}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="company">Companies</option>
            <option value="designer">Designers / branches</option>
          </select>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Choose up to 366 days. Filters also apply to drill-down links.
      </p>
      <Button type="submit">Apply filters</Button>
      {query.designerId ? (
        <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">
          Filtered to one designer.{' '}
          <Link
            className="text-primary hover:underline"
            href={adminVisibilityHref(action, query, { designerId: undefined, groupBy })}
          >
            Clear designer filter
          </Link>
        </p>
      ) : null}
    </form>
  );
}
