'use client';

import { useState, type ReactNode } from 'react';
import type { ModerationReasonCode, ProjectListItem, ProjectStatus } from '@repo/contracts';
import { Tooltip, TooltipContent, TooltipTrigger } from '@repo/ui/components/tooltip';
import { ImagePlus } from 'lucide-react';
import { ProjectModerationReasons } from '@/components/project-moderation-reasons';
import { projectStatusLabel, projectStatusDescriptions } from '@/lib/project-status-presentation';

// These cards contain information only. Edit/View actions stay in the table.
// Radix supplies portal positioning, collision handling, Escape and outside dismissal.
function ProjectDetailsCard({
  label,
  trigger,
  children,
  className,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={
            className ??
            'inline-flex rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          }
          onClick={() => setOpen(true)}
        >
          {trigger}
        </button>
      </TooltipTrigger>
      <TooltipContent
        hideArrow
        side="bottom"
        align="start"
        collisionPadding={12}
        className="w-80 max-w-[calc(100vw-1.5rem)] max-h-[var(--radix-tooltip-content-available-height)] overflow-y-auto border border-border bg-popover p-0 text-left text-popover-foreground shadow-lg"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

export function ProjectPreview({
  project,
  updatedLabel,
}: {
  project: ProjectListItem;
  updatedLabel: string;
}) {
  const location =
    [project.locality, project.city].filter(Boolean).join(', ') || 'Location not added';
  return (
    <ProjectDetailsCard
      label={`Preview ${project.title}`}
      className="flex w-full min-w-0 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      trigger={
        <>
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
            {project.coverImageUrl ? (
              <img src={project.coverImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus className="size-4 text-muted-foreground" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {project.title}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{location}</span>
          </span>
        </>
      }
    >
      {project.coverImageUrl ? (
        <img src={project.coverImageUrl} alt="" className="aspect-video w-full object-cover" />
      ) : (
        <div className="flex h-24 items-center justify-center bg-muted">
          <ImagePlus aria-hidden className="size-6 text-muted-foreground" />
        </div>
      )}
      <div className="space-y-2 p-3">
        <p className="break-words text-sm font-semibold">{project.title}</p>
        <p className="text-sm text-muted-foreground">{location}</p>
        <p className="text-sm">{project.propertyType ?? 'Property type not added'}</p>
        <p className="border-t border-border pt-2 text-xs text-muted-foreground">
          Last updated {updatedLabel}
        </p>
      </div>
    </ProjectDetailsCard>
  );
}

export function StatusWithFeedback({
  status,
  moderationNote,
  rejectionReasonCode,
  rejectionReasonCodes,
  updatedLabel,
  livePending = false,
  children,
}: {
  status: ProjectStatus;
  moderationNote: string | null;
  rejectionReasonCode: ModerationReasonCode | null;
  rejectionReasonCodes: ModerationReasonCode[];
  updatedLabel: string;
  livePending?: boolean;
  children: ReactNode;
}) {
  const reasonCodes =
    rejectionReasonCodes.length > 0
      ? rejectionReasonCodes
      : rejectionReasonCode
        ? [rejectionReasonCode]
        : [];
  const hasFeedback =
    (status === 'changes_requested' || status === 'rejected') &&
    (moderationNote || reasonCodes.length > 0);
  const notes = (moderationNote ?? '')
    .split(/\r?\n/)
    .map((note) => note.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
  return (
    <ProjectDetailsCard label={`${projectStatusLabel(status)} details`} trigger={children}>
      <div className="space-y-3 p-3 text-sm">
        <p className="font-semibold">
          {livePending
            ? `Pending changes · ${projectStatusLabel(status)}`
            : projectStatusLabel(status)}
        </p>
        {livePending ? (
          <p>Your published version is still live. This status applies to your pending edits.</p>
        ) : null}
        <p className="text-muted-foreground">{projectStatusDescriptions[status]}</p>
        {hasFeedback ? (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="font-medium">
              {status === 'rejected' ? 'Rejection reason:' : 'Changes needed on:'}
            </p>
            <ProjectModerationReasons reasonCodes={reasonCodes} />
            {notes.length > 0 ? (
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                {notes.map((note, index) => (
                  <li key={`${note}-${index}`}>{note}</li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}
        <p className="border-t border-border pt-2 text-xs text-muted-foreground">
          Updated {updatedLabel}
        </p>
      </div>
    </ProjectDetailsCard>
  );
}
