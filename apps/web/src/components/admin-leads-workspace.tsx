import Link from 'next/link';
import type { AdminLeadDetail, AdminLeadQuery, AdminLeadResponse } from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table';
import { UrlListPagination } from '@/components/list-pagination';
import { adminVisibilityHref } from '@/lib/admin-visibility-api';

const dates = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});
const date = (value: string | null) => (value ? dates.format(new Date(value)) : 'Not recorded');
function Stage({ status }: { status: string }) {
  return (
    <Badge
      variant={status === 'new' ? 'warning' : status === 'contacted' ? 'success' : 'secondary'}
    >
      {status}
    </Badge>
  );
}
export function AdminLeadsWorkspace({
  result,
  query,
}: {
  result: AdminLeadResponse;
  query: AdminLeadQuery;
}) {
  return (
    <>
      <section aria-label="Lead pipeline" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {(['total', 'new', 'contacted', 'closed', 'spam'] as const).map((stage) => (
          <Link
            key={stage}
            href={adminVisibilityHref('/admin/leads', query, {
              status: stage === 'total' ? undefined : stage,
              page: 1,
            })}
            aria-current={(query.status ?? 'total') === stage ? 'page' : undefined}
            className="rounded-xl border bg-card p-4 hover:bg-accent aria-[current=page]:border-primary"
          >
            <p className="text-sm capitalize text-muted-foreground">
              {stage === 'total' ? 'All leads' : stage}
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold">{result.pipeline[stage]}</p>
          </Link>
        ))}
      </section>
      <p className="text-sm text-muted-foreground">
        Stages reflect current lead status for leads received in the selected period. Opening
        records here does not mark them viewed or contacted.
      </p>
      {result.items.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    'Lead',
                    'Company / designer',
                    'Project',
                    'Budget / source',
                    'Assignment',
                    'Stage',
                    'Received (IST)',
                  ].map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <Link
                        className="font-medium text-primary hover:underline"
                        href={adminVisibilityHref(`/admin/leads/${lead.id}`, query, {
                          page: 1,
                          limit: 25,
                        })}
                      >
                        {lead.name}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">{lead.contactNumber}</p>
                    </TableCell>
                    <TableCell>
                      <Link
                        className="hover:underline"
                        href={adminVisibilityHref(
                          '/admin/analytics',
                          {
                            from: result.window.from,
                            to: result.window.to,
                            organizationId: lead.company.id,
                          },
                          { groupBy: 'designer' },
                        )}
                      >
                        {lead.company.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {lead.designer?.name ?? lead.branch.name}
                      </p>
                    </TableCell>
                    <TableCell>{lead.project?.name ?? 'No referred project'}</TableCell>
                    <TableCell>
                      {lead.budget ?? 'Not specified'}
                      <p className="text-xs text-muted-foreground">{lead.source}</p>
                    </TableCell>
                    <TableCell>{lead.assignedMember?.name ?? 'Unassigned'}</TableCell>
                    <TableCell>
                      <Stage status={lead.status} />
                    </TableCell>
                    <TableCell>{date(lead.receivedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          No leads match these filters.
        </p>
      )}
      {result.total > 0 ? (
        <UrlListPagination
          {...result}
          itemName="lead"
          itemNamePlural="leads"
          pageSizes={[10, 25, 50, 100]}
        />
      ) : null}
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value || 'Not recorded'}</dd>
    </div>
  );
}
export function AdminLeadRecord({ lead }: { lead: AdminLeadDetail }) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">{lead.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Read-only lead record · {lead.id}</p>
        </div>
        <Stage status={lead.status} />
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Lead details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Contact number" value={lead.contactNumber} />
            <Field label="Company" value={lead.company.name} />
            <Field label="Designer" value={lead.designer?.name} />
            <Field label="Branch" value={lead.branch.name} />
            <Field label="Assigned to" value={lead.assignedMember?.name ?? 'Unassigned'} />
            <Field label="Source" value={lead.source} />
            <Field label="Budget" value={lead.budget} />
            <Field label="Referred project" value={lead.project?.name} />
            <Field label="Received (IST)" value={date(lead.receivedAt)} />
            <Field label="Created (IST)" value={date(lead.createdAt)} />
            <Field label="Updated (IST)" value={date(lead.updatedAt)} />
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Original lead message" value={lead.message} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Internal notes" value={lead.notes} />
            </div>
          </dl>
        </CardContent>
      </Card>
      {lead.enquiry ? (
        <Card>
          <CardHeader>
            <CardTitle>Enquiry and response milestones</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Requester" value={lead.enquiry.requester.name} />
              <Field label="Requester email" value={lead.enquiry.requester.email} />
              <Field label="Requester phone" value={lead.enquiry.requester.phone} />
              <Field label="Subject" value={lead.enquiry.subject} />
              <Field label="Enquiry status" value={lead.enquiry.status} />
              <Field label="Budget" value={lead.enquiry.budget} />
              <Field label="Timeline" value={lead.enquiry.timeline} />
              <Field label="Template" value={lead.enquiry.templateUsed} />
              <Field label="Sent (IST)" value={date(lead.enquiry.createdAt)} />
              <Field label="Enquiry updated (IST)" value={date(lead.enquiry.updatedAt)} />
              <Field label="First viewed by studio (IST)" value={date(lead.enquiry.viewedAt)} />
              <Field label="First studio response (IST)" value={date(lead.enquiry.contactedAt)} />
              <Field label="Latest studio message (IST)" value={date(lead.enquiry.lastMessageAt)} />
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="Enquiry description" value={lead.enquiry.description} />
              </div>
            </dl>
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground">This lead has no linked enquiry.</p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Studio messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {lead.messages.total} recorded messages. Reading here does not acknowledge requester
            activity.
          </p>
          {lead.messages.items.length ? (
            <ol className="space-y-4">
              {lead.messages.items.map((message) => (
                <li key={message.id} className="rounded-lg border p-4">
                  <p className="text-sm font-medium">
                    {message.author?.name ?? 'Deleted account'}{' '}
                    <time
                      className="ml-2 font-normal text-muted-foreground"
                      dateTime={message.createdAt}
                    >
                      {date(message.createdAt)}
                    </time>
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">{message.body}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No studio messages recorded.</p>
          )}
          {lead.messages.total > 0 ? (
            <UrlListPagination
              {...lead.messages}
              itemName="message"
              itemNamePlural="messages"
              pageSizes={[10, 25, 50, 100]}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
