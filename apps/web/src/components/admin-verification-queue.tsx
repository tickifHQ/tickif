'use client';

import { useState } from 'react';
import type {
  AdminVerificationDetailResponse,
  AdminVerificationQueueResponse,
  VerificationDocumentType,
} from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Checkbox } from '@repo/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog';
import { EmptyState } from '@repo/ui/components/empty-state';
import { Label } from '@repo/ui/components/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table';
import { Textarea } from '@repo/ui/components/textarea';
import {
  AlertCircle,
  ArrowDown,
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileText,
  Loader2,
  RefreshCw,
  UserRound,
  XCircle,
} from 'lucide-react';
import {
  approveAdminVerification,
  fetchAdminVerificationDetail,
  fetchAdminVerificationDocumentUrl,
  fetchAdminVerificationQueue,
  rejectAdminVerification,
} from '@/lib/admin-verification-api';

type ReviewIntent = 'approve' | 'request_changes';

const documentLabels: Record<VerificationDocumentType, string> = {
  personal_pan: 'Personal PAN',
  aadhaar: 'Aadhaar',
  gst_registration_certificate: 'GST registration certificate',
  msme_udyam_registration: 'MSME/Udyam registration',
  shop_establishment_licence: 'Shop and establishment licence',
  business_pan: 'Business PAN',
  certificate_of_incorporation: 'Certificate of incorporation',
};

function formatDate(value: string | null): string {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatAge(value: string | null): string {
  if (!value) return 'No pending submissions';
  const ageMs = Math.max(0, Date.now() - new Date(value).getTime());
  const ageHours = Math.floor(ageMs / 3_600_000);
  if (ageHours < 1) return 'Less than an hour';
  if (ageHours < 24) return `${ageHours}h old`;
  return `${Math.floor(ageHours / 24)}d old`;
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: AdminVerificationDetailResponse['application']['status']): string {
  if (status === 'pending') return 'Pending review';
  if (status === 'verified') return 'Verified';
  if (status === 'rejected') return 'Changes requested';
  return 'Draft';
}

function statusVariant(status: AdminVerificationDetailResponse['application']['status']) {
  if (status === 'verified') return 'success' as const;
  if (status === 'rejected') return 'warning' as const;
  if (status === 'pending') return 'info' as const;
  return 'secondary' as const;
}

function oldestSubmission(queue: AdminVerificationQueueResponse): string | null {
  return (
    queue.items
      .map((item) => item.submittedAt)
      .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0] ?? null
  );
}

function QueueTable({
  queue,
  onOpen,
}: {
  queue: AdminVerificationQueueResponse;
  onOpen: (applicationId: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <Table className="min-w-3xl">
        <TableHeader>
          <TableRow className="bg-muted/35 hover:bg-muted/35">
            <TableHead className="min-w-56">Organization</TableHead>
            <TableHead>Designer</TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1">
                Submitted <ArrowDown className="size-3.5" aria-hidden="true" />
              </span>
            </TableHead>
            <TableHead>Submission</TableHead>
            <TableHead>Documents</TableHead>
            <TableHead className="text-right"> </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {queue.items.length > 0 ? (
            queue.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Building2 className="size-4" aria-hidden="true" />
                    </span>
                    <span className="font-medium text-foreground">{item.organizationName}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.designerName}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatDate(item.submittedAt)}
                </TableCell>
                <TableCell>
                  <Badge variant={item.attempt > 1 ? 'warning' : 'outline'}>
                    Attempt {item.attempt}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {item.documentCount}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpen(item.id)}
                    aria-label={`Open verification for ${item.organizationName}`}
                  >
                    Review <ExternalLink className="size-3.5" aria-hidden="true" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="py-16">
                <EmptyState
                  icon={<FileCheck2 className="size-5" />}
                  title="No pending verifications"
                  description="New designer submissions will appear here automatically."
                />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ReviewDetail({
  detail,
  onClose,
  onReviewed,
}: {
  detail: AdminVerificationDetailResponse;
  onClose: () => void;
  onReviewed: () => Promise<void>;
}) {
  const { application, documents, eligibility, history } = detail;
  const [reviewIntent, setReviewIntent] = useState<ReviewIntent | null>(null);
  const [feedback, setFeedback] = useState('');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(
    () => new Set(documents.map((document) => document.id)),
  );
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<ReviewIntent | null>(null);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);

  function openReviewConfirmation(intent: ReviewIntent) {
    setReviewIntent(intent);
    setFeedback('');
    setFeedbackError(null);
    setActionError(null);
    if (intent === 'request_changes') {
      setSelectedDocumentIds(new Set(documents.map((document) => document.id)));
    }
  }

  function toggleDocument(documentId: string, checked: boolean) {
    setSelectedDocumentIds((current) => {
      const next = new Set(current);
      if (checked) next.add(documentId);
      else next.delete(documentId);
      return next;
    });
  }

  async function openDocument(documentId: string) {
    setOpeningDocumentId(documentId);
    setActionError(null);
    try {
      const url = await fetchAdminVerificationDocumentUrl(application.id, documentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not open this document.');
    } finally {
      setOpeningDocumentId(null);
    }
  }

  async function submitReview() {
    const intent = reviewIntent;
    if (!intent) return;
    if (intent === 'request_changes') {
      if (!feedback.trim()) {
        setFeedbackError('Feedback is required.');
        return;
      }
      if (selectedDocumentIds.size === 0) {
        setFeedbackError('Select at least one document that needs to be resubmitted.');
        return;
      }
    }

    setBusyAction(intent);
    setFeedbackError(null);
    setActionError(null);
    try {
      if (intent === 'approve') {
        await approveAdminVerification(application.id);
      } else {
        await rejectAdminVerification(application.id, {
          note: feedback.trim(),
          rejectedDocumentVersionIds: [...selectedDocumentIds],
        });
      }
      setReviewIntent(null);
      await onReviewed();
    } catch (error) {
      setReviewIntent(null);
      setActionError(
        error instanceof Error ? error.message : 'The verification decision could not be saved.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <DialogHeader className="border-b px-6 py-5 pr-14">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Designer profile review
            </p>
            <DialogTitle className="mt-2 truncate font-display text-2xl">
              {application.organizationName}
            </DialogTitle>
            <DialogDescription className="mt-1">
              Submitted by {application.designerName} · Attempt {application.attempt}
            </DialogDescription>
          </div>
          <Badge variant={statusVariant(application.status)}>
            {statusLabel(application.status)}
          </Badge>
        </div>
      </DialogHeader>

      <div className="space-y-8 px-6 py-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-display text-base font-semibold">Application</h3>
            <span className="text-xs text-muted-foreground">
              Submitted {formatDate(application.submittedAt)}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 size-4 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-xs text-muted-foreground">Organization</p>
                  <p className="mt-1 text-sm font-medium">{application.organizationName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Profile: {application.designerName}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <UserRound className="mt-0.5 size-4 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Account owner</p>
                  <p className="mt-1 text-sm font-medium">{application.ownerName}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {application.ownerEmail}
                  </p>
                  {application.ownerPhone ? (
                    <p className="mt-1 text-xs text-muted-foreground">{application.ownerPhone}</p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="flex items-center gap-3">
                {eligibility.phoneVerified.met ? (
                  <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
                ) : (
                  <XCircle className="size-5 text-destructive" aria-hidden="true" />
                )}
                <div>
                  <p className="text-sm font-medium">Phone verified</p>
                  <p className="text-xs text-muted-foreground">Account owner phone number</p>
                </div>
              </div>
              <Badge variant={eligibility.phoneVerified.met ? 'success' : 'destructive'}>
                {eligibility.phoneVerified.met ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="flex items-center gap-3">
                {eligibility.publishedProjects.met ? (
                  <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
                ) : (
                  <XCircle className="size-5 text-destructive" aria-hidden="true" />
                )}
                <div>
                  <p className="text-sm font-medium">Approved projects</p>
                  <p className="text-xs text-muted-foreground">
                    {eligibility.publishedProjects.current} of{' '}
                    {eligibility.publishedProjects.required} approved
                  </p>
                </div>
              </div>
              <Badge variant={eligibility.publishedProjects.met ? 'success' : 'destructive'}>
                {eligibility.publishedProjects.met ? 'Met' : 'Not met'}
              </Badge>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-display text-base font-semibold">Submitted documents</h3>
            <span className="text-xs text-muted-foreground">{documents.length} available</span>
          </div>
          <div className="divide-y rounded-lg border">
            {documents.map((document) => (
              <div
                key={document.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FileText className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{documentLabels[document.type]}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatFileSize(document.size)} · {document.contentType} · Version{' '}
                      {document.version}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void openDocument(document.id)}
                  disabled={openingDocumentId !== null}
                  aria-label={`View ${documentLabels[document.type]}`}
                >
                  {openingDocumentId === document.id ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  )}
                  View document
                </Button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Documents open through short-lived, admin-authorized links.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="font-display text-base font-semibold">Review history</h3>
          <ol className="space-y-4 border-l pl-4">
            {history.length > 0 ? (
              history.map((event) => (
                <li key={event.id} className="relative space-y-1">
                  <span
                    className="absolute -left-5 top-1 size-2 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium capitalize">
                    {event.action.replaceAll('_', ' ')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {event.actorLabel} · {formatDate(event.createdAt)} · Attempt {event.attempt}
                  </p>
                  {event.note ? (
                    <p className="text-sm text-muted-foreground">{event.note}</p>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">No review history yet.</li>
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
          {application.status === 'pending' ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => openReviewConfirmation('request_changes')}
                disabled={busyAction !== null}
              >
                <XCircle className="size-4" aria-hidden="true" />
                Request changes
              </Button>
              <Button
                type="button"
                onClick={() => openReviewConfirmation('approve')}
                disabled={busyAction !== null}
              >
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Approve verification
              </Button>
            </>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <Dialog open={reviewIntent !== null} onOpenChange={(open) => !open && setReviewIntent(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {reviewIntent === 'approve' ? 'Approve profile verification' : 'Request changes'}
            </DialogTitle>
            <DialogDescription>
              {reviewIntent === 'approve'
                ? 'This verifies the designer profile and all current documents.'
                : 'Tell the designer what must be corrected before they resubmit.'}
            </DialogDescription>
          </DialogHeader>

          {reviewIntent === 'request_changes' ? (
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="text-sm font-medium">Documents requiring resubmission</p>
                <div className="space-y-3 rounded-lg border p-3">
                  {documents.map((document) => {
                    const inputId = `rejected-document-${document.id}`;
                    return (
                      <div key={document.id} className="flex items-center gap-3">
                        <Checkbox
                          id={inputId}
                          checked={selectedDocumentIds.has(document.id)}
                          onCheckedChange={(checked) =>
                            toggleDocument(document.id, checked === true)
                          }
                        />
                        <Label htmlFor={inputId} className="font-normal">
                          {documentLabels[document.type]}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="verification-feedback">Feedback for the designer</Label>
                <Textarea
                  id="verification-feedback"
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="Explain what needs to be corrected..."
                  maxLength={2000}
                />
              </div>
              {feedbackError ? <p className="text-sm text-destructive">{feedbackError}</p> : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setReviewIntent(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={reviewIntent === 'request_changes' ? 'destructive' : 'default'}
              onClick={() => void submitReview()}
              disabled={busyAction !== null}
            >
              {busyAction ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {reviewIntent === 'approve' ? 'Confirm approval' : 'Send feedback'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdminVerificationQueue({
  initialQueue,
  initialError,
}: {
  initialQueue: AdminVerificationQueueResponse;
  initialError?: string;
}) {
  const [queue, setQueue] = useState(initialQueue);
  const [queueError, setQueueError] = useState<string | null>(initialError ?? null);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminVerificationDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function loadPage(page: number) {
    setLoadingQueue(true);
    setQueueError(null);
    try {
      setQueue(await fetchAdminVerificationQueue(page));
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : 'Could not load this queue.');
    } finally {
      setLoadingQueue(false);
    }
  }

  async function openDetail(applicationId: string) {
    setSelectedApplicationId(applicationId);
    setDetail(null);
    setDetailError(null);
    setLoadingDetail(true);
    try {
      setDetail(await fetchAdminVerificationDetail(applicationId));
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : 'Could not load this verification application.',
      );
    } finally {
      setLoadingDetail(false);
    }
  }

  function closeDetail() {
    setSelectedApplicationId(null);
    setDetail(null);
    setDetailError(null);
  }

  async function handleReviewed() {
    closeDetail();
    setQueueError(null);
    try {
      const currentPage = queue.page;
      const refreshed = await fetchAdminVerificationQueue(currentPage);
      if (refreshed.items.length === 0 && currentPage > 1) {
        setQueue(await fetchAdminVerificationQueue(currentPage - 1));
      } else {
        setQueue(refreshed);
      }
    } catch {
      setQueueError('The decision was saved, but the queue could not refresh. Try again.');
    }
  }

  const oldest = oldestSubmission(queue);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-primary">
            Tickif operations
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Profile verification
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Review designer profile evidence in submission order, approve complete applications, or
            send clear feedback for resubmission.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm">
          <Clock3 className="size-4 text-primary" aria-hidden="true" />
          <span className="text-muted-foreground">Oldest submission</span>
          <span className="font-medium text-foreground">{formatAge(oldest)}</span>
        </div>
      </div>

      {queueError ? (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{queueError}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadPage(queue.page)}
            disabled={loadingQueue}
          >
            <RefreshCw
              className={`size-3.5 ${loadingQueue ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Retry
          </Button>
        </div>
      ) : null}

      <QueueTable queue={queue} onOpen={(id) => void openDetail(id)} />

      {queue.totalPages > 1 ? (
        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Page {queue.page} of {queue.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadPage(queue.page - 1)}
              disabled={loadingQueue || queue.page <= 1}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadPage(queue.page + 1)}
              disabled={loadingQueue || queue.page >= queue.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={selectedApplicationId !== null} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent
          className="left-auto right-0 top-0 h-dvh max-h-none w-full max-w-3xl translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none border-y-0 border-r-0 p-0"
          overlayClassName="bg-foreground/30"
        >
          <DialogTitle className="sr-only">Profile verification review</DialogTitle>
          <DialogDescription className="sr-only">
            Review submitted designer identity and business documents.
          </DialogDescription>
          {loadingDetail ? (
            <div className="flex min-h-96 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-label="Loading verification" />
            </div>
          ) : detailError ? (
            <div className="flex min-h-96 flex-col items-center justify-center gap-3 px-8 text-center">
              <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
              <p className="text-sm text-destructive">{detailError}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => selectedApplicationId && void openDetail(selectedApplicationId)}
              >
                Try again
              </Button>
            </div>
          ) : detail ? (
            <ReviewDetail detail={detail} onClose={closeDetail} onReviewed={handleReviewed} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
