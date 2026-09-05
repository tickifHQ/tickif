'use client';

import { useState } from 'react';
import {
  ADMIN_VERIFICATION_QUEUE_TAB,
  ADMIN_VERIFICATION_QUEUE_TAB_VALUES,
  BUSINESS_VERIFICATION_DOCUMENT_TYPES,
  VERIFICATION_DOCUMENT_STATUS,
  type AdminVerificationDetailResponse,
  type AdminVerificationQueueResponse,
  type AdminVerificationQueueTab,
  type VerificationDocumentType,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/components/tabs';
import { Textarea } from '@repo/ui/components/textarea';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileText,
  Loader2,
  RefreshCw,
  Undo,
  UserRound,
  XCircle,
} from 'lucide-react';
import {
  approveAdminVerification,
  fetchAdminVerificationDetail,
  fetchAdminVerificationDocumentUrl,
  fetchAdminVerificationQueue,
  rejectAdminVerification,
  revokeAdminVerification,
} from '@/lib/admin-verification-api';

type ReviewIntent = 'approve' | 'request_changes' | 'revoke';

const tabLabels: Record<AdminVerificationQueueTab, string> = {
  new: 'New',
  re_review: 'Re-review',
  accepted: 'Accepted',
  changes_requested: 'Changes requested',
  expired: 'Expired',
};

const emptyStateContent: Record<AdminVerificationQueueTab, { title: string; description: string }> =
  {
    new: {
      title: 'No new verifications',
      description: 'First-time designer submissions will appear here automatically.',
    },
    re_review: {
      title: 'No verifications awaiting re-review',
      description: 'Resubmitted applications will appear here automatically.',
    },
    accepted: {
      title: 'No accepted verifications',
      description: 'Approved designer verifications will appear here.',
    },
    changes_requested: {
      title: 'No changes requested',
      description: 'Applications returned to designers for corrections will appear here.',
    },
    expired: {
      title: 'No expired verifications',
      description: 'Expired approvals awaiting designer renewal will appear here.',
    },
  };

const businessDocumentTypes = new Set<VerificationDocumentType>(
  BUSINESS_VERIFICATION_DOCUMENT_TYPES,
);

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
  if (!value) return 'No applications';
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
  if (status === 'expired') return 'Expired';
  return 'Draft';
}

function statusVariant(status: AdminVerificationDetailResponse['application']['status']) {
  if (status === 'verified') return 'success' as const;
  if (status === 'rejected' || status === 'expired') return 'warning' as const;
  if (status === 'pending') return 'info' as const;
  return 'secondary' as const;
}

function isPendingTab(tab: AdminVerificationQueueTab): boolean {
  return tab === ADMIN_VERIFICATION_QUEUE_TAB.NEW || tab === ADMIN_VERIFICATION_QUEUE_TAB.RE_REVIEW;
}

function queueMetricDate(queue: AdminVerificationQueueResponse): string | null {
  const dates = queue.items
    .map((item) => (isPendingTab(queue.tab) ? item.submittedAt : item.reviewedAt))
    .filter((value): value is string => value !== null)
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime());
  return isPendingTab(queue.tab) ? (dates[0] ?? null) : (dates.at(-1) ?? null);
}

function emptyQueue(tab: AdminVerificationQueueTab, limit: number): AdminVerificationQueueResponse {
  return { items: [], page: 1, limit, total: 0, totalPages: 0, tab };
}

function removeReviewedApplication(
  queue: AdminVerificationQueueResponse,
  applicationId: string,
): AdminVerificationQueueResponse {
  if (!queue.items.some((item) => item.id === applicationId)) return queue;
  const total = Math.max(0, queue.total - 1);
  return {
    ...queue,
    items: queue.items.filter((item) => item.id !== applicationId),
    total,
    totalPages: Math.ceil(total / queue.limit),
  };
}

function QueueTable({
  queue,
  onOpen,
}: {
  queue: AdminVerificationQueueResponse;
  onOpen: (applicationId: string) => void;
}) {
  const pending = isPendingTab(queue.tab);
  const emptyState = emptyStateContent[queue.tab];
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <Table className="min-w-[48rem]">
        <TableHeader>
          <TableRow className="bg-muted/35 hover:bg-muted/35">
            <TableHead className="min-w-56">Organization</TableHead>
            <TableHead>Designer</TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1">
                {pending ? 'Submitted' : 'Reviewed'}
                {pending ? (
                  <ArrowUp className="size-3.5" aria-hidden="true" />
                ) : (
                  <ArrowDown className="size-3.5" aria-hidden="true" />
                )}
              </span>
            </TableHead>
            <TableHead>{pending ? 'Submission' : 'Status'}</TableHead>
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
                  {formatDate(pending ? item.submittedAt : item.reviewedAt)}
                </TableCell>
                <TableCell>
                  {pending ? (
                    <Badge variant={item.attempt > 1 ? 'warning' : 'outline'}>
                      Attempt {item.attempt}
                    </Badge>
                  ) : (
                    <div className="space-y-1">
                      <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                      {item.expiresAt ? (
                        <p className="text-xs text-muted-foreground">
                          {item.status === 'expired' ? 'Expired' : 'Expires'}{' '}
                          {formatDate(item.expiresAt)}
                        </p>
                      ) : null}
                    </div>
                  )}
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
                    {pending ? 'Review' : 'View'}
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="py-16">
                <EmptyState
                  icon={<FileCheck2 className="size-5" />}
                  title={emptyState.title}
                  description={emptyState.description}
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
  onReviewed: (applicationId: string, intent: ReviewIntent) => void;
}) {
  const { application, documents, eligibility, history } = detail;
  const renewal =
    application.status === 'pending' &&
    history.some(
      (event) =>
        event.attempt === application.attempt &&
        event.action === 'resubmitted' &&
        event.fromStatus === 'verified',
    );
  const [reviewIntent, setReviewIntent] = useState<ReviewIntent | null>(null);
  const [feedback, setFeedback] = useState('');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(() => new Set());
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<ReviewIntent | null>(null);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
  const hasReviewableBusinessDocument = documents.some(
    (document) =>
      businessDocumentTypes.has(document.type) &&
      (document.status === VERIFICATION_DOCUMENT_STATUS.UPLOADED ||
        document.status === VERIFICATION_DOCUMENT_STATUS.VERIFIED),
  );
  const hasOnlyReviewableDocuments = documents.every(
    (document) =>
      document.status === VERIFICATION_DOCUMENT_STATUS.UPLOADED ||
      document.status === VERIFICATION_DOCUMENT_STATUS.VERIFIED,
  );
  const approvalEligible =
    eligibility.phoneVerified.met &&
    eligibility.publishedProjects.met &&
    application.ownerName.trim().length >= 2 &&
    hasReviewableBusinessDocument &&
    hasOnlyReviewableDocuments;

  function openReviewConfirmation(intent: ReviewIntent) {
    setReviewIntent(intent);
    setFeedback('');
    setFeedbackError(null);
    setActionError(null);
    if (intent === 'request_changes') {
      setSelectedDocumentIds(new Set());
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
    if (intent === 'revoke' && !feedback.trim()) {
      setFeedbackError('A reason for revocation is required.');
      return;
    }

    setBusyAction(intent);
    setFeedbackError(null);
    setActionError(null);
    try {
      if (intent === 'approve') {
        await approveAdminVerification(application.id);
      } else if (intent === 'request_changes') {
        await rejectAdminVerification(application.id, {
          note: feedback.trim(),
          rejectedDocumentVersionIds: [...selectedDocumentIds],
        });
      } else {
        await revokeAdminVerification(application.id, { note: feedback.trim() });
      }
    } catch (error) {
      setReviewIntent(null);
      setActionError(
        error instanceof Error ? error.message : 'The verification decision could not be saved.',
      );
      return;
    } finally {
      setBusyAction(null);
    }

    setReviewIntent(null);
    onReviewed(application.id, intent);
  }

  return (
    <>
      <DialogHeader className="min-w-0 border-b px-6 py-5 pr-14 text-left">
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

      <div className="min-w-0 space-y-8 px-6 py-6">
        {application.status === 'expired' ? (
          <div className="rounded-lg border bg-muted/35 p-4 text-sm" role="status">
            Approval expired {formatDate(application.expiresAt)}. The verified badge is inactive.
            The designer can update documents and submit a renewal from their verification page.
          </div>
        ) : renewal ? (
          <div className="rounded-lg border bg-muted/35 p-4 text-sm" role="status">
            Renewal review: this designer resubmitted after their previous approval expired. Check
            the current documents before granting a new two-month approval.
          </div>
        ) : null}
        {application.approvedAt ? (
          <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Approved</dt>
              <dd>{formatDate(application.approvedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Approval expires</dt>
              <dd>{formatDate(application.expiresAt)}</dd>
            </div>
          </dl>
        ) : null}
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
                <div className="min-w-0 break-words">
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
                  <p className="text-sm font-medium">Published projects</p>
                  <p className="text-xs text-muted-foreground">
                    {eligibility.publishedProjects.current} of{' '}
                    {eligibility.publishedProjects.required} published
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
                disabled={busyAction !== null || !approvalEligible}
              >
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Approve verification
              </Button>
            </>
          ) : null}
          {application.status === 'verified' ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => openReviewConfirmation('revoke')}
              disabled={busyAction !== null}
            >
              <Undo className="size-4" aria-hidden="true" />
              Revoke approval
            </Button>
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
              {reviewIntent === 'approve'
                ? 'Approve profile verification'
                : reviewIntent === 'revoke'
                  ? 'Revoke profile verification'
                  : 'Request changes'}
            </DialogTitle>
            <DialogDescription>
              {reviewIntent === 'approve'
                ? 'This verifies the designer profile and all current documents.'
                : reviewIntent === 'revoke'
                  ? 'This removes the verified status immediately and returns the application to Re-review.'
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

          {reviewIntent === 'revoke' ? (
            <div className="space-y-2">
              <Label htmlFor="verification-revocation-reason">Reason for revocation</Label>
              <Textarea
                id="verification-revocation-reason"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="Explain why this profile needs another review..."
                maxLength={2000}
              />
              {feedbackError ? <p className="text-sm text-destructive">{feedbackError}</p> : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setReviewIntent(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={reviewIntent === 'approve' ? 'default' : 'destructive'}
              onClick={() => void submitReview()}
              disabled={
                busyAction !== null ||
                (reviewIntent === 'request_changes' && selectedDocumentIds.size === 0)
              }
            >
              {busyAction ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {reviewIntent === 'approve'
                ? 'Confirm approval'
                : reviewIntent === 'revoke'
                  ? 'Confirm revocation'
                  : 'Send feedback'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdminVerificationQueue({
  initialQueue,
  initialCounts,
  initialError,
}: {
  initialQueue: AdminVerificationQueueResponse;
  initialCounts?: Record<AdminVerificationQueueTab, number>;
  initialError?: string;
}) {
  const [activeTab, setActiveTab] = useState<AdminVerificationQueueTab>(initialQueue.tab);
  const [queues, setQueues] = useState<
    Partial<Record<AdminVerificationQueueTab, AdminVerificationQueueResponse>>
  >({
    [initialQueue.tab]: initialQueue,
  });
  const [tabCounts, setTabCounts] = useState<Record<AdminVerificationQueueTab, number>>(() => ({
    new: initialQueue.tab === ADMIN_VERIFICATION_QUEUE_TAB.NEW ? initialQueue.total : 0,
    re_review: initialQueue.tab === ADMIN_VERIFICATION_QUEUE_TAB.RE_REVIEW ? initialQueue.total : 0,
    accepted: initialQueue.tab === ADMIN_VERIFICATION_QUEUE_TAB.ACCEPTED ? initialQueue.total : 0,
    expired: initialQueue.tab === ADMIN_VERIFICATION_QUEUE_TAB.EXPIRED ? initialQueue.total : 0,
    changes_requested:
      initialQueue.tab === ADMIN_VERIFICATION_QUEUE_TAB.CHANGES_REQUESTED ? initialQueue.total : 0,
    ...initialCounts,
  }));
  const [queueError, setQueueError] = useState<string | null>(initialError ?? null);
  const [loadingTab, setLoadingTab] = useState<AdminVerificationQueueTab | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminVerificationDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const activeQueue = queues[activeTab] ?? emptyQueue(activeTab, initialQueue.limit);

  async function fetchQueuePage(tab: AdminVerificationQueueTab, page: number) {
    const nextQueue = await fetchAdminVerificationQueue(tab, page);
    if (nextQueue.tab !== tab) throw new Error('Could not load this queue.');
    if (nextQueue.items.length === 0 && page > 1) {
      const previousQueue = await fetchAdminVerificationQueue(tab, page - 1);
      if (previousQueue.tab !== tab) throw new Error('Could not load this queue.');
      return previousQueue;
    }
    return nextQueue;
  }

  async function loadPage(tab: AdminVerificationQueueTab, page: number) {
    setLoadingTab(tab);
    setQueueError(null);
    try {
      const nextQueue = await fetchQueuePage(tab, page);
      setQueues((current) => ({ ...current, [tab]: nextQueue }));
      setTabCounts((current) => ({ ...current, [tab]: nextQueue.total }));
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : 'Could not load this queue.');
    } finally {
      setLoadingTab(null);
    }
  }

  async function changeTab(value: string) {
    const tab = ADMIN_VERIFICATION_QUEUE_TAB_VALUES.find((candidate) => candidate === value);
    if (!tab) return;
    setQueueError(null);
    setActiveTab(tab);
    if (queues[tab]) return;
    await loadPage(tab, 1);
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

  async function refreshLoadedQueues(
    loadedQueues: Partial<
      Record<AdminVerificationQueueTab, AdminVerificationQueueResponse>
    > = queues,
  ) {
    const loadedTabs = ADMIN_VERIFICATION_QUEUE_TAB_VALUES.filter((tab) => loadedQueues[tab]);
    const results = await Promise.allSettled(
      loadedTabs.map(async (tab) => {
        const currentPage = loadedQueues[tab]?.page ?? 1;
        return [tab, await fetchQueuePage(tab, currentPage)] as const;
      }),
    );
    const successfulQueues = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    if (successfulQueues.length > 0) {
      setQueues((current) => {
        const next = { ...current };
        for (const [tab, queue] of successfulQueues) next[tab] = queue;
        return next;
      });
      setTabCounts((current) => {
        const next = { ...current };
        for (const [tab, queue] of successfulQueues) next[tab] = queue.total;
        return next;
      });
    }
    if (results.some((result) => result.status === 'rejected')) {
      setQueueError('The decision was saved, but the queue could not refresh. Try again.');
    }
  }

  function handleReviewed(applicationId: string, intent: ReviewIntent) {
    const loadedQueues = queues;
    const sourceTab = activeTab;
    const destinationTab =
      intent === 'approve'
        ? ADMIN_VERIFICATION_QUEUE_TAB.ACCEPTED
        : intent === 'revoke'
          ? ADMIN_VERIFICATION_QUEUE_TAB.RE_REVIEW
          : ADMIN_VERIFICATION_QUEUE_TAB.CHANGES_REQUESTED;
    closeDetail();
    setQueueError(null);
    setQueues((current) => {
      const next = { ...current };
      for (const tab of ADMIN_VERIFICATION_QUEUE_TAB_VALUES) {
        const queue = current[tab];
        if (queue) next[tab] = removeReviewedApplication(queue, applicationId);
      }
      return next;
    });
    setTabCounts((current) => ({
      ...current,
      [sourceTab]: Math.max(0, current[sourceTab] - 1),
      [destinationTab]: current[destinationTab] + 1,
    }));
    void refreshLoadedQueues(loadedQueues);
  }

  const metricDate = queueMetricDate(activeQueue);
  const pendingTab = isPendingTab(activeTab);

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
          <span className="text-muted-foreground">
            {pendingTab ? 'Oldest submission' : 'Latest decision'}
          </span>
          <span className="font-medium text-foreground">{formatAge(metricDate)}</span>
        </div>
      </div>

      {queueError ? (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{queueError}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadPage(activeTab, activeQueue.page)}
            disabled={loadingTab !== null}
          >
            <RefreshCw
              className={`size-3.5 ${loadingTab ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Retry
          </Button>
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={(value) => void changeTab(value)}>
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList aria-label="Profile verification queues">
            {ADMIN_VERIFICATION_QUEUE_TAB_VALUES.map((tab) => (
              <TabsTrigger key={tab} value={tab} disabled={loadingTab !== null}>
                {loadingTab === tab ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                {tabLabels[tab]}
                <span className="ml-1 text-xs text-muted-foreground">{tabCounts[tab]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {ADMIN_VERIFICATION_QUEUE_TAB_VALUES.map((tab) => {
          const tabQueue = queues[tab] ?? emptyQueue(tab, initialQueue.limit);
          return (
            <TabsContent key={tab} value={tab} className="mt-5">
              <QueueTable queue={tabQueue} onOpen={(id) => void openDetail(id)} />
            </TabsContent>
          );
        })}
      </Tabs>

      {activeQueue.totalPages > 1 ? (
        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Page {activeQueue.page} of {activeQueue.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadPage(activeTab, activeQueue.page - 1)}
              disabled={loadingTab !== null || activeQueue.page <= 1}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadPage(activeTab, activeQueue.page + 1)}
              disabled={loadingTab !== null || activeQueue.page >= activeQueue.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={selectedApplicationId !== null} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent
          className="left-auto right-0 top-0 h-dvh max-h-none w-full max-w-3xl translate-x-0 translate-y-0 grid-cols-1 gap-0 overflow-y-auto rounded-none border-y-0 border-r-0 p-0 sm:max-w-3xl"
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
