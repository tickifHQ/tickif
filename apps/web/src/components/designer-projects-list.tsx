import Link from 'next/link';
import type { ListProjectsResponse, ProjectListStatus, ProjectStatus } from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { EmptyState } from '@repo/ui/components/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table';
import {
  CheckCircle2,
  Archive,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  FileClock,
  FileCheck,
  ImagePlus,
  EyeOff,
  Trash2,
} from 'lucide-react';
import { DesignerListControls } from '@/components/designer-list-controls';
import { DesignerListPagination } from '@/components/designer-list-pagination';
import { DesignerProjectRowActions } from '@/components/designer-project-row-actions';
import { cn } from '@repo/ui/lib/utils';

const projectTabs: Array<{ value: ProjectListStatus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Live' },
  { value: 'in_review', label: 'In review' },
  { value: 'draft', label: 'Drafts' },
  { value: 'archived', label: 'Archived' },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function formatUpdated(value: string) {
  const updatedAt = new Date(value).getTime();
  const diffMs = Date.now() - updatedAt;
  const diffHours = Math.max(1, Math.round(diffMs / 3_600_000));

  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  return formatDate(value);
}

function StatusFeedbackHoverCard({
  title,
  note,
  updatedAt,
}: {
  title: string;
  note: string;
  updatedAt: string;
}) {
  const noteItems = note
    .split(/\r?\n/)
    .map((item) => item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute top-full left-0 z-30 mt-2 w-80 origin-top-left scale-95 overflow-hidden rounded-lg bg-background text-left opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover/status:pointer-events-auto group-hover/status:scale-100 group-hover/status:opacity-100 group-focus-visible/status:pointer-events-auto group-focus-visible/status:scale-100 group-focus-visible/status:opacity-100"
    >
      <div className="flex flex-col gap-2 px-3 py-2 text-[13px]">
        <p className="font-medium leading-[1.1] text-foreground">{title}</p>
        <ol className="list-decimal space-y-0 pl-5 leading-[1.6] text-muted-foreground">
          {noteItems.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ol>
      </div>
      <div className="border-t border-dotted border-border px-3 py-2 text-[11px] text-muted-foreground">
        Flagged {formatUpdated(updatedAt)}
      </div>
    </div>
  );
}

function StatusBadgeWithFeedback({
  status,
  moderationNote,
  rejectionReasonCode,
  updatedAt,
}: {
  status: ProjectStatus;
  moderationNote: string | null;
  rejectionReasonCode: string | null;
  updatedAt: string;
}) {
  const feedback =
    status === 'changes_requested'
      ? moderationNote
      : status === 'rejected'
        ? (moderationNote ?? rejectionReasonCode)
        : null;

  if (!feedback) return <StatusBadge status={status} />;

  return (
    <div
      className="group/status relative inline-flex outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      tabIndex={0}
      aria-label={`${statusLabel(status)} details`}
    >
      <StatusBadge status={status} />
      <StatusFeedbackHoverCard
        title={status === 'rejected' ? 'Rejection reason:' : 'Changes needed on:'}
        note={feedback}
        updatedAt={updatedAt}
      />
    </div>
  );
}

function statusLabel(status: ProjectStatus) {
  if (status === 'published') return 'Live';
  if (status === 'submitted') return 'Submitted';
  if (status === 'in_review') return 'In review';
  if (status === 'changes_requested') return 'Needs Change';
  if (status === 'rejected') return 'Rejected';
  if (status === 'archived') return 'Archived';
  if (status === 'delisted') return 'Delisted';
  if (status === 'deleted') return 'Deleted';
  return 'Draft';
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  if (status === 'published') {
    return (
      <Badge
        variant="success"
        className="rounded-md bg-success/15 px-2 py-1 font-normal text-success"
      >
        <CircleCheck aria-hidden className="!size-3.5 text-success" strokeWidth={2.5} />
        {statusLabel(status)}
      </Badge>
    );
  }

  if (status === 'changes_requested') {
    return (
      <Badge
        variant="destructive"
        className="rounded-md bg-destructive/10 px-2 py-1 text-[13px] text-destructive"
      >
        <CircleAlert className="size-3.5" />
        {statusLabel(status)}
      </Badge>
    );
  }

  const variant =
    status === 'rejected' || status === 'deleted'
      ? 'destructive'
      : status === 'draft' || status === 'archived' || status === 'delisted'
        ? 'secondary'
        : 'warning';
  const StatusIcon =
    status === 'draft'
      ? CircleDashed
      : status === 'submitted'
        ? FileCheck
        : status === 'in_review'
          ? FileClock
          : status === 'rejected'
            ? CircleX
            : status === 'archived'
              ? Archive
              : status === 'delisted'
                ? EyeOff
                : status === 'deleted'
                  ? Trash2
                  : CheckCircle2;
  const statusClassName =
    status === 'submitted' || status === 'in_review'
      ? 'rounded-md bg-warning/10 px-2 py-1 text-[13px] text-warning'
      : status === 'rejected' || status === 'deleted'
        ? 'rounded-md bg-destructive/10 px-2 py-1 text-[13px] text-destructive'
        : 'rounded-md px-2 py-1 text-[13px]';

  return (
    <Badge variant={variant} className={statusClassName}>
      <StatusIcon className="size-3.5" />
      {statusLabel(status)}
    </Badge>
  );
}

function ProjectTypeBadge({ label }: { label: string | null }) {
  const normalizedLabel = label?.toLowerCase() ?? '';
  const className = normalizedLabel.includes('villa')
    ? 'bg-feature-lighter text-feature'
    : normalizedLabel.includes('apartment')
      ? 'bg-info/10 text-info'
      : 'bg-info/10 text-info';

  return (
    <Badge
      variant="secondary"
      className={cn(
        'rounded-full border-transparent px-2.5 py-1 text-[13px] font-medium leading-[1.1]',
        className,
      )}
    >
      {label ?? 'Project'}
    </Badge>
  );
}

export function DesignerProjectsList({
  projects,
  tabCounts,
  activeStatus,
  query,
  error,
  canArchiveProjects = false,
  canDeleteProjects = false,
}: {
  projects: ListProjectsResponse;
  tabCounts?: Partial<Record<ProjectListStatus, number>>;
  activeStatus: ProjectListStatus;
  query?: string;
  error?: string;
  canArchiveProjects?: boolean;
  canDeleteProjects?: boolean;
}) {
  return (
    <div className="space-y-6 p-5">
      <DesignerListControls
        tabs={projectTabs.map((tab) => ({
          ...tab,
          count:
            tabCounts?.[tab.value] ?? (tab.value === activeStatus ? projects.total : undefined),
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
        <Table className="min-w-[62rem]">
          <TableHeader>
            <TableRow className="border-0 bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[22rem] rounded-l-lg">Project</TableHead>
              <TableHead className="w-[12.5rem]">Type</TableHead>
              <TableHead className="w-[11rem]">Status</TableHead>
              <TableHead className="w-[11.5rem]">Uploaded on</TableHead>
              <TableHead className="w-[11.5rem]">Last updated</TableHead>
              <TableHead className="w-[7.5rem] rounded-r-lg text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.items.length > 0 ? (
              projects.items.map((project) => (
                <TableRow key={project.id} className="hover:bg-transparent">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                        {project.coverImageUrl ? (
                          <img
                            src={project.coverImageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ImagePlus className="size-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {project.title}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[project.locality, project.city].filter(Boolean).join(', ') ||
                            'Location not added'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ProjectTypeBadge label={project.propertyType} />
                  </TableCell>
                  <TableCell>
                    <StatusBadgeWithFeedback
                      status={project.status}
                      moderationNote={project.moderationNote}
                      rejectionReasonCode={project.rejectionReasonCode}
                      updatedAt={project.updatedAt}
                    />
                  </TableCell>
                  <TableCell className="text-sm font-medium text-muted-foreground">
                    {formatDate(project.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-muted-foreground">
                    {formatUpdated(project.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <DesignerProjectRowActions
                      projectId={project.id}
                      projectTitle={project.title}
                      projectStatus={project.status}
                      canArchive={canArchiveProjects}
                      canDelete={canDeleteProjects}
                    />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center">
                  <EmptyState
                    icon={<ImagePlus className="size-5" />}
                    title="No projects found"
                    description={
                      query
                        ? 'Try a different search or clear the filter.'
                        : 'Add your first project to make your portfolio live.'
                    }
                    action={
                      <Button asChild variant="emphasis">
                        <Link href="/designer/projects/new">Add new project</Link>
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DesignerListPagination
        page={projects.page}
        totalPages={projects.totalPages}
        total={projects.total}
        limit={projects.limit}
        className={cn(projects.items.length === 0 && 'opacity-70')}
      />
    </div>
  );
}
