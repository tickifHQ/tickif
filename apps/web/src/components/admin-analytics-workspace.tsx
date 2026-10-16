import Link from 'next/link';
import type { AdminEntityQuery, AdminEntityResponse, AdminReportResponse } from '@repo/contracts';
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
import { AdminEnquiryCohortChart } from '@/components/admin-enquiry-cohort-chart';

export function AdminAnalyticsWorkspace({
  report,
  entities,
  query,
}: {
  report: AdminReportResponse;
  entities: AdminEntityResponse;
  query: AdminEntityQuery;
}) {
  const metrics = report.metrics;
  const scope = {
    from: report.window.from,
    to: report.window.to,
    organizationId: query.organizationId,
    designerId: query.designerId,
  };
  const cards = [
    ['Leads received', metrics.leads],
    ['Enquiries submitted', metrics.enquiries],
    ['Recorded studio responses', metrics.respondedEnquiries],
    ['Response rate', `${metrics.responseRate.toFixed(1)}%`],
    ['Progressed enquiries', metrics.progressedEnquiries],
    ['Pipeline conversion rate', `${metrics.conversionRate.toFixed(1)}%`],
    ['Project views', metrics.projectViews],
    ['Profile views', metrics.profileViews],
    ['Projects created', metrics.projectsCreated],
  ] as const;
  return (
    <>
      <section
        aria-label="Performance summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {cards.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 font-mono text-3xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="rounded-xl border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
        <p>
          Enquiry reporting follows enquiries submitted in the selected period. Response rate is the
          percentage with a recorded studio message, including later responses. Historical
          status-only responses have no recorded response timestamp and are excluded.
        </p>
        <p className="mt-2">
          Pipeline conversion is the percentage of submitted enquiries whose linked lead is
          currently contacted or closed. It measures pipeline progression; confirmed sales and
          revenue are not recorded. Views and projects use their own event/creation dates. View
          totals depend on retained events.
        </p>
      </div>
      <section aria-label="Lead stage breakdown" className="flex flex-wrap gap-3">
        {(['new', 'contacted', 'closed', 'spam'] as const).map((stage) => (
          <Link
            key={stage}
            className="rounded-lg border bg-card px-4 py-3 text-sm hover:bg-accent"
            href={adminVisibilityHref('/admin/leads', scope, { status: stage })}
          >
            <span className="capitalize">{stage}</span>: <strong>{metrics[stage]}</strong>
          </Link>
        ))}
      </section>
      <div className="flex flex-wrap gap-4 text-sm font-medium text-primary">
        <Link className="hover:underline" href={adminVisibilityHref('/admin/leads', scope)}>
          View matching leads →
        </Link>
        {query.designerId ? (
          <Link
            className="hover:underline"
            href={adminVisibilityHref('/admin/analytics', scope, {
              designerId: undefined,
              groupBy: 'designer',
            })}
          >
            All company designers
          </Link>
        ) : null}
        {query.organizationId ? (
          <Link
            className="hover:underline"
            href={adminVisibilityHref('/admin/analytics', scope, {
              organizationId: undefined,
              designerId: undefined,
              groupBy: 'company',
            })}
          >
            All companies
          </Link>
        ) : null}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {query.groupBy === 'company' ? 'Company performance' : 'Designer / branch performance'}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Select a name to drill down. Directory name search filters this table; summary totals
            follow date, company and designer filters.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {entities.items.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    'Name',
                    'Leads',
                    'Enquiries',
                    'Studio responses',
                    'Response rate',
                    'Progressed',
                    'Pipeline conversion',
                    'Project views',
                    'Profile views',
                    'Projects created',
                  ].map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {entities.items.map((entity) => (
                  <TableRow key={entity.id}>
                    <TableCell>
                      <Link
                        className="font-medium text-primary hover:underline"
                        href={adminVisibilityHref('/admin/analytics', scope, {
                          organizationId: entity.organizationId,
                          designerId: query.groupBy === 'designer' ? entity.id : undefined,
                          groupBy: 'designer',
                          page: 1,
                        })}
                      >
                        {entity.name}
                      </Link>
                      {query.groupBy === 'designer' ? (
                        <p className="text-xs text-muted-foreground">
                          {entity.companyName} · {entity.status}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>{entity.metrics.leads}</TableCell>
                    <TableCell>{entity.metrics.enquiries}</TableCell>
                    <TableCell>{entity.metrics.respondedEnquiries}</TableCell>
                    <TableCell>{entity.metrics.responseRate.toFixed(1)}%</TableCell>
                    <TableCell>{entity.metrics.progressedEnquiries}</TableCell>
                    <TableCell>{entity.metrics.conversionRate.toFixed(1)}%</TableCell>
                    <TableCell>{entity.metrics.projectViews}</TableCell>
                    <TableCell>{entity.metrics.profileViews}</TableCell>
                    <TableCell>{entity.metrics.projectsCreated}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="p-8 text-center text-muted-foreground">
              No companies or designers match these filters.
            </p>
          )}
        </CardContent>
      </Card>
      {entities.total > 0 ? (
        <UrlListPagination
          {...entities}
          itemName={query.groupBy === 'company' ? 'company' : 'designer'}
          itemNamePlural={query.groupBy === 'company' ? 'companies' : 'designers'}
          pageSizes={[10, 25, 50, 100]}
        />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Enquiry submission cohorts by day</CardTitle>
          <p className="text-sm text-muted-foreground">
            Responses and progression belong to the day the enquiry was submitted. Dates use India
            time.
          </p>
        </CardHeader>
        <CardContent>
          <AdminEnquiryCohortChart activity={report.activity} />
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Show daily response and conversion report
            </summary>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submission date</TableHead>
                  <TableHead>Enquiries</TableHead>
                  <TableHead>Studio responses</TableHead>
                  <TableHead>Response rate</TableHead>
                  <TableHead>Progressed</TableHead>
                  <TableHead>Pipeline conversion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.activity.map((day) => (
                  <TableRow key={day.date}>
                    <TableCell>{day.date}</TableCell>
                    <TableCell>{day.enquiries}</TableCell>
                    <TableCell>{day.responded}</TableCell>
                    <TableCell>
                      {day.enquiries ? ((day.responded / day.enquiries) * 100).toFixed(1) : '0.0'}%
                    </TableCell>
                    <TableCell>{day.progressed}</TableCell>
                    <TableCell>
                      {day.enquiries ? ((day.progressed / day.enquiries) * 100).toFixed(1) : '0.0'}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        </CardContent>
      </Card>
    </>
  );
}
