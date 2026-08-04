'use client';

import type {
  AdminCorrectProjectInput,
  AdminModerationDetailResponse,
  AdminModerationQueueItem,
  AdminModerationQueueResponse,
  AdminModerationProject,
  ProjectCompletenessRequirement,
} from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog';
import { EmptyState } from '@repo/ui/components/empty-state';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/components/tabs';
import { Textarea } from '@repo/ui/components/textarea';
import {
  AlertCircle,
  ArrowDown,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  ImageIcon,
  Loader2,
  Pencil,
  ShieldAlert,
  Tags,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  correctAdminProject,
  fetchAdminModerationDetail,
  fetchAdminModerationQueue,
  publishAdminProject,
  rejectAdminProject,
  requestAdminChanges,
  startAdminReview,
  unpublishAdminProject,
} from '@/lib/admin-moderation-api';

type ModerationTab = 'submitted' | 'in_review';
type ActionIntent = 'request_changes' | 'reject' | 'unpublish';
type EditableField =
  | 'title'
  | 'propertyTypeSlug'
  | 'scopeSlug'
  | 'citySlug'
  | 'localitySlug'
  | 'budgetBandSlug';

const tabLabels: Record<ModerationTab, string> = {
  submitted: 'Submitted',
  in_review: 'In review by me',
};

const editableFields: Array<{ key: EditableField; label: string }> = [
  { key: 'title', label: 'Project title' },
  { key: 'propertyTypeSlug', label: 'Property type' },
  { key: 'scopeSlug', label: 'Scope' },
  { key: 'citySlug', label: 'City' },
  { key: 'localitySlug', label: 'Locality' },
  { key: 'budgetBandSlug', label: 'Budget band' },
];

function formatDate(value: string | null) {
  if (!value) return 'Not submitted';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(value),
  );
}

function formatAge(value: string | null) {
  if (!value) return 'No submission date';
  const ageMs = Math.max(0, Date.now() - new Date(value).getTime());
  const ageHours = Math.floor(ageMs / 3_600_000);
  if (ageHours < 1) return 'Less than an hour';
  if (ageHours < 24) return `${ageHours}h old`;
  const ageDays = Math.floor(ageHours / 24);
  return `${ageDays}d old`;
}

function oldestSubmission(items: AdminModerationQueueItem[]) {
  return (
    items
      .map((item) => item.submittedAt)
      .filter((value): value is string => value !== null)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null
  );
}

function statusLabel(status: AdminModerationProject['status']) {
  return status.replace('_', ' ');
}

function statusVariant(status: AdminModerationProject['status']) {
  if (status === 'published') return 'success' as const;
  if (status === 'rejected') return 'destructive' as const;
  if (status === 'changes_requested') return 'warning' as const;
  return 'info' as const;
}

function readableValue(value: string | null) {
  return value ? value.replaceAll('-', ' ') : 'Not set';
}

function fieldValue(project: AdminModerationProject, field: EditableField) {
  return project[field] ?? '';
}

function fieldPatch(field: EditableField, value: string): AdminCorrectProjectInput {
  const trimmed = value.trim();
  const nullable = trimmed || null;
  switch (field) {
    case 'title':
      return { title: trimmed };
    case 'propertyTypeSlug':
      return { propertyTypeSlug: nullable };
    case 'scopeSlug':
      return { scopeSlug: nullable };
    case 'citySlug':
      return { citySlug: nullable };
    case 'localitySlug':
      return { localitySlug: nullable };
    case 'budgetBandSlug':
      return { budgetBandSlug: nullable };
  }
}

function QueueTable({
  queue,
  tab,
  onOpen,
}: {
  queue: AdminModerationQueueResponse;
  tab: ModerationTab;
  onOpen: (projectId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <Table className="min-w-[50rem]">
        <TableHeader>
          <TableRow className="bg-muted/35 hover:bg-muted/35">
            <TableHead className="min-w-64">Project</TableHead>
            <TableHead>Designer</TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1">
                Submitted <ArrowDown className="size-3.5" />
              </span>
            </TableHead>
            <TableHead>Readiness</TableHead>
            <TableHead>Review</TableHead>
            <TableHead className="text-right"> </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {queue.items.length > 0 ? (
            queue.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <ImageIcon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.imageCount} images</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.designerName}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatDate(item.submittedAt)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${item.completeness.complete ? 'bg-success' : 'bg-warning'}`}
                      aria-hidden="true"
                    />
                    <span className="text-sm text-muted-foreground">
                      {item.completeness.score}%
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {item.reviewedBy ? (
                    <Badge variant="secondary">Claimed</Badge>
                  ) : (
                    <Badge variant="outline">Unclaimed</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpen(item.id)}
                    aria-label={`Open review for ${item.title}`}
                  >
                    Open <ExternalLink className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="py-16">
                <EmptyState
                  icon={<FileCheck2 className="size-5" />}
                  title={`No ${tabLabels[tab].toLowerCase()} projects`}
                  description="The queue is clear for now. New submissions will appear here automatically."
                />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function Completeness({ requirements }: { requirements: ProjectCompletenessRequirement[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold">Completeness</h3>
        <span className="text-xs text-muted-foreground">Review before publishing</span>
      </div>
      <ul className="space-y-2 rounded-lg border p-3">
        {requirements.map((requirement) => (
          <li key={requirement.key} className="flex items-center gap-2 text-sm">
            {requirement.complete ? (
              <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
            ) : (
              <AlertCircle className="size-4 text-warning" aria-hidden="true" />
            )}
            <span className={requirement.complete ? 'text-foreground' : 'text-muted-foreground'}>
              {requirement.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewDetail({
  detail,
  currentUserId,
  currentUserRole,
  onClose,
  onUpdated,
}: {
  detail: AdminModerationDetailResponse;
  currentUserId: string;
  currentUserRole: string;
  onClose: () => void;
  onUpdated: (detail: AdminModerationDetailResponse) => void;
}) {
  const { project } = detail;
  const [actionIntent, setActionIntent] = useState<ActionIntent | null>(null);
  const [note, setNote] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const isOwner = currentUserRole === 'superadmin' || project.reviewedBy === currentUserId;
  const canModerate = project.status === 'in_review' && isOwner;
  const blockedByOtherAdmin = project.status === 'in_review' && !isOwner;

  async function perform(action: string, operation: () => Promise<AdminModerationDetailResponse>) {
    setBusyAction(action);
    setActionError(null);
    try {
      onUpdated(await operation());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The action could not be completed.');
    } finally {
      setBusyAction(null);
    }
  }

  function openNoteAction(intent: ActionIntent) {
    setActionIntent(intent);
    setNote('');
    setReasonCode('');
    setNoteError(null);
  }

  async function submitNoteAction() {
    const trimmedNote = note.trim();
    if (!trimmedNote) {
      setNoteError('A note is required for this action.');
      return;
    }
    if (actionIntent === 'reject' && !reasonCode.trim()) {
      setNoteError('A rejection reason code is required.');
      return;
    }

    const intent = actionIntent;
    if (!intent) return;
    const operation =
      intent === 'reject'
        ? () => rejectAdminProject(project.id, { note: trimmedNote, reasonCode: reasonCode.trim() })
        : intent === 'request_changes'
          ? () => requestAdminChanges(project.id, { note: trimmedNote })
          : () => unpublishAdminProject(project.id, { note: trimmedNote });
    setActionIntent(null);
    await perform(intent, operation);
  }

  async function saveMetadata(field: EditableField) {
    const value = draftValue.trim();
    if (field === 'title' && value.length < 3) {
      setMetadataError('Project title must be at least 3 characters.');
      return;
    }
    setBusyAction(`metadata:${field}`);
    setMetadataError(null);
    try {
      const updated = await correctAdminProject(project.id, fieldPatch(field, draftValue));
      onUpdated(updated);
      setEditingField(null);
    } catch (error) {
      setMetadataError(error instanceof Error ? error.message : 'Could not save metadata.');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <DialogHeader className="border-b px-6 py-5 pr-14">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Project review
            </p>
            <DialogTitle className="mt-2 truncate font-display text-2xl">
              {project.title}
            </DialogTitle>
            <DialogDescription className="mt-1">
              Submitted by {project.designerName}
            </DialogDescription>
          </div>
          <Badge variant={statusVariant(project.status)}>{statusLabel(project.status)}</Badge>
        </div>
      </DialogHeader>

      <div className="space-y-8 px-6 py-6">
        {blockedByOtherAdmin ? (
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>This project is being reviewed by another admin. Actions are disabled.</span>
          </div>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold">Images</h3>
            <span className="text-xs text-muted-foreground">{detail.images.length} uploaded</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {detail.images.map((image) => {
              const room = detail.rooms.find((candidate) => candidate.id === image.roomId);
              return (
                <div key={image.id} className="group overflow-hidden rounded-lg border bg-muted/30">
                  <a
                    href={image.originalUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                    aria-label={`Open original image ${image.id}`}
                  >
                    <div
                      className="aspect-[4/3] bg-cover bg-center transition-transform group-hover:scale-[1.02]"
                      style={
                        image.originalUrl
                          ? { backgroundImage: `url("${image.originalUrl}")` }
                          : undefined
                      }
                    >
                      {!image.originalUrl ? (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="size-5" />
                        </div>
                      ) : null}
                      <span className="sr-only">Admin-only original image</span>
                    </div>
                  </a>
                  <div className="space-y-1 px-3 py-2 text-xs">
                    <p className="font-medium text-foreground">{room?.name ?? 'Unassigned room'}</p>
                    <p className="text-muted-foreground">{image.status}</p>
                    {image.duplicate ? (
                      <p className="flex items-center gap-1 text-warning-foreground">
                        <ShieldAlert className="size-3" /> Possible duplicate
                        <span className="text-muted-foreground">
                          (distance {image.duplicate.distance})
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Previews use admin-signed image access. Originals open in a separate tab.
          </p>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold">Metadata</h3>
            <Tags className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="divide-y rounded-lg border">
            {editableFields.map(({ key, label }) => {
              const isEditing = editingField === key;
              return (
                <div key={key} className="flex items-center justify-between gap-4 px-3 py-2.5">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  {isEditing ? (
                    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                      <Input
                        aria-label={label}
                        value={draftValue}
                        onChange={(event) => setDraftValue(event.target.value)}
                        className="h-8 max-w-52 text-right"
                      />
                      <Button
                        type="button"
                        size="icon"
                        className="size-8"
                        onClick={() => void saveMetadata(key)}
                        disabled={busyAction === `metadata:${key}`}
                        aria-label={`Save ${label}`}
                      >
                        {busyAction === `metadata:${key}` ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => setEditingField(null)}
                        aria-label={`Cancel ${label}`}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-right text-sm font-medium capitalize text-foreground">
                        {readableValue(fieldValue(project, key))}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => {
                          setEditingField(key);
                          setDraftValue(fieldValue(project, key));
                          setMetadataError(null);
                        }}
                        disabled={!canModerate}
                        aria-label={`Edit ${label}`}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {metadataError ? <p className="text-sm text-destructive">{metadataError}</p> : null}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold">Rooms</h3>
            <span className="text-xs text-muted-foreground">{detail.rooms.length} rooms</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {detail.rooms.map((room) => (
              <div key={room.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{room.name}</p>
                  <span className="text-xs text-muted-foreground">
                    {detail.images.filter((image) => image.roomId === room.id).length} images
                  </span>
                </div>
                {room.description ? (
                  <p className="mt-1 text-xs text-muted-foreground">{room.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <Completeness requirements={detail.completeness.requirements} />

        <section className="space-y-3">
          <h3 className="font-display text-base font-semibold">Moderation history</h3>
          <ol className="space-y-4 border-l pl-4">
            {detail.history.length > 0 ? (
              detail.history.map((event) => (
                <li key={event.id} className="relative space-y-1">
                  <span
                    className="absolute -left-[1.34rem] top-1 size-2 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium capitalize">
                    {event.action.replaceAll('_', ' ')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {event.actorLabel} · {formatDate(event.createdAt)}
                  </p>
                  {event.note ? (
                    <p className="text-sm text-muted-foreground">{event.note}</p>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">No moderation actions recorded yet.</li>
            )}
          </ol>
        </section>

        {actionError ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {actionError}
          </p>
        ) : null}
      </div>

      <div className="sticky bottom-0 border-t bg-card px-6 py-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {project.status === 'submitted' ? (
            <Button
              type="button"
              onClick={() => void perform('start-review', () => startAdminReview(project.id))}
              disabled={busyAction !== null}
            >
              {busyAction === 'start-review' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Clock3 className="size-4" />
              )}
              Start review
            </Button>
          ) : null}
          {canModerate ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => openNoteAction('request_changes')}
                disabled={busyAction !== null}
              >
                Request changes
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => openNoteAction('reject')}
                disabled={busyAction !== null}
              >
                Reject
              </Button>
              <Button
                type="button"
                onClick={() => void perform('publish', () => publishAdminProject(project.id))}
                disabled={busyAction !== null || !detail.completeness.complete}
              >
                {busyAction === 'publish' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Approve
              </Button>
            </>
          ) : null}
          {project.status === 'published' ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => openNoteAction('unpublish')}
              disabled={busyAction !== null}
            >
              Unpublish
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <Dialog open={actionIntent !== null} onOpenChange={(open) => !open && setActionIntent(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {actionIntent === 'reject'
                ? 'Reject project'
                : actionIntent === 'unpublish'
                  ? 'Unpublish project'
                  : 'Request changes'}
            </DialogTitle>
            <DialogDescription>
              A note is required and will be visible in the moderation history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="moderation-note">Note</Label>
              <Textarea
                id="moderation-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Explain what needs attention..."
              />
            </div>
            {actionIntent === 'reject' ? (
              <div className="space-y-2">
                <Label htmlFor="rejection-reason">Reason code</Label>
                <Input
                  id="rejection-reason"
                  value={reasonCode}
                  onChange={(event) => setReasonCode(event.target.value)}
                  placeholder="quality"
                />
              </div>
            ) : null}
            {noteError ? <p className="text-sm text-destructive">{noteError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setActionIntent(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={actionIntent === 'reject' ? 'destructive' : 'default'}
              onClick={() => void submitNoteAction()}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdminModerationQueue({
  initialQueue,
  currentUserId,
  currentUserRole,
  initialError,
}: {
  initialQueue: AdminModerationQueueResponse;
  currentUserId: string;
  currentUserRole: string;
  initialError?: string;
}) {
  const [activeTab, setActiveTab] = useState<ModerationTab>('submitted');
  const [queues, setQueues] = useState<
    Partial<Record<ModerationTab, AdminModerationQueueResponse>>
  >({
    submitted: initialQueue,
  });
  const [queueError, setQueueError] = useState<string | null>(initialError ?? null);
  const [loadingTab, setLoadingTab] = useState<ModerationTab | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminModerationDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const activeQueue = queues[activeTab] ?? { ...initialQueue, items: [], total: 0, totalPages: 0 };
  const oldest = oldestSubmission(queues.submitted?.items ?? []);

  async function changeTab(value: string) {
    const tab = value as ModerationTab;
    setActiveTab(tab);
    if (queues[tab]) return;
    setLoadingTab(tab);
    setQueueError(null);
    try {
      const nextQueue = await fetchAdminModerationQueue(tab);
      setQueues((current) => ({ ...current, [tab]: nextQueue }));
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : 'Could not load this queue.');
    } finally {
      setLoadingTab(null);
    }
  }

  async function openDetail(projectId: string) {
    setSelectedProjectId(projectId);
    setDetail(null);
    setDetailError(null);
    setLoadingDetail(true);
    try {
      setDetail(await fetchAdminModerationDetail(projectId));
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : 'Could not load this project review.',
      );
    } finally {
      setLoadingDetail(false);
    }
  }

  function closeDetail() {
    setSelectedProjectId(null);
    setDetail(null);
    setDetailError(null);
  }

  async function refreshQueues() {
    const tabs: ModerationTab[] = ['submitted', 'in_review'];
    const results = await Promise.allSettled(tabs.map((tab) => fetchAdminModerationQueue(tab)));
    setQueues((current) => {
      const next = { ...current };
      results.forEach((result, index) => {
        const tab = tabs[index]!;
        if (result.status === 'fulfilled') next[tab] = result.value;
      });
      return next;
    });
  }

  function handleDetailUpdated(nextDetail: AdminModerationDetailResponse) {
    setDetail(nextDetail);
    void refreshQueues();
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Tickif operations
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Moderation queue
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Review submissions in the order they arrived, correct metadata when needed, and keep
            publishing decisions auditable.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm">
          <Clock3 className="size-4 text-primary" aria-hidden="true" />
          <span className="text-muted-foreground">Oldest submission</span>
          <span className="font-medium text-foreground">{formatAge(oldest)}</span>
        </div>
      </div>

      {queueError ? (
        <div className="mb-5 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {queueError}
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={(value) => void changeTab(value)}>
        <TabsList aria-label="Moderation queues">
          {(Object.keys(tabLabels) as ModerationTab[]).map((tab) => (
            <TabsTrigger key={tab} value={tab} disabled={loadingTab === tab}>
              {loadingTab === tab ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {tabLabels[tab]}
              {queues[tab] ? (
                <span className="ml-1 text-xs text-muted-foreground">{queues[tab]?.total}</span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="submitted" className="mt-5">
          <QueueTable
            queue={activeTab === 'submitted' ? activeQueue : (queues.submitted ?? initialQueue)}
            tab="submitted"
            onOpen={(id) => void openDetail(id)}
          />
        </TabsContent>
        <TabsContent value="in_review" className="mt-5">
          <QueueTable
            queue={activeTab === 'in_review' ? activeQueue : (queues.in_review ?? activeQueue)}
            tab="in_review"
            onOpen={(id) => void openDetail(id)}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={selectedProjectId !== null} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent
          className="left-auto right-0 top-0 h-[100dvh] max-h-none w-full max-w-2xl translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none border-y-0 border-r-0 p-0 sm:max-w-2xl"
          overlayClassName="bg-foreground/30"
        >
          <DialogTitle className="sr-only">Project review</DialogTitle>
          <DialogDescription className="sr-only">
            Review project moderation details.
          </DialogDescription>
          {loadingDetail ? (
            <div className="flex min-h-[30rem] items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-label="Loading review" />
            </div>
          ) : detailError ? (
            <div className="flex min-h-[30rem] flex-col items-center justify-center gap-3 px-8 text-center">
              <AlertCircle className="size-6 text-destructive" />
              <p className="text-sm text-destructive">{detailError}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => selectedProjectId && void openDetail(selectedProjectId)}
              >
                Try again
              </Button>
            </div>
          ) : detail ? (
            <ReviewDetail
              detail={detail}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              onClose={closeDetail}
              onUpdated={handleDetailUpdated}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
