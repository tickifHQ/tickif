'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  createProjectReportSchema,
  projectReportReasonSchema,
  projectReportResponseSchema,
  savedProjectStateSchema,
  savedProjectsStateResponseSchema,
  type ProjectReportReason,
} from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/dialog';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import { Textarea } from '@repo/ui/components/textarea';
import { Bookmark, Check, Flag, Loader2, Share2 } from 'lucide-react';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or promotional content' },
  { value: 'misleading', label: 'Misleading project information' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'copyright', label: 'Copyright concern' },
  { value: 'other', label: 'Something else' },
] as const satisfies ReadonlyArray<{ value: ProjectReportReason; label: string }>;

export function ProjectActions({
  projectId,
  loginHref,
  saveCount = 0,
}: {
  projectId: string;
  loginHref: string;
  saveCount?: number;
}) {
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadedSaveStateKey, setLoadedSaveStateKey] = useState<string | null>(null);
  const [visibleSaveCount, setVisibleSaveCount] = useState(saveCount);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ProjectReportReason | ''>('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const [isReported, setIsReported] = useState(false);
  const reportDetailsId = useId();
  const sessionUserId = session?.user.id ?? null;
  const saveStateKey = sessionUserId ? `${sessionUserId}:${projectId}` : null;
  const isSaveStateLoading = saveStateKey !== null && loadedSaveStateKey !== saveStateKey;

  useEffect(() => {
    if (!sessionUserId || !saveStateKey) {
      setIsSaved(false);
      setLoadedSaveStateKey(null);
      return;
    }

    let ignore = false;
    setIsSaved(false);
    void api.api['saved-projects'].state
      .$get({ query: { projectIds: projectId } })
      .then(async (response) => {
        if (!response.ok || ignore) return;
        const parsed = savedProjectsStateResponseSchema.safeParse(await response.json());
        if (parsed.success && !ignore) {
          setIsSaved(parsed.data.savedProjectIds.includes(projectId));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ignore) setLoadedSaveStateKey(saveStateKey);
      });

    return () => {
      ignore = true;
    };
  }, [projectId, saveStateKey, sessionUserId]);

  async function toggleSaved() {
    if (!session || isSaving || isSaveStateLoading) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      const response = isSaved
        ? await api.api['saved-projects'][':projectId'].$delete({ param: { projectId } })
        : await api.api['saved-projects'][':projectId'].$put({ param: { projectId } });
      if (!response.ok) throw new Error('Could not update saved project.');

      const parsed = savedProjectStateSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('Invalid saved project response.');
      if (parsed.data.saved !== isSaved) {
        setVisibleSaveCount((current) =>
          parsed.data.saved ? current + 1 : Math.max(0, current - 1),
        );
      }
      setIsSaved(parsed.data.saved);
    } catch {
      setSaveError('Could not update saved project. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function shareProject() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('copied');
      window.setTimeout(() => setShareStatus('idle'), 2000);
    } catch {
      setShareStatus('idle');
    }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || isReporting) return;

    const parsed = createProjectReportSchema.safeParse({
      reason: reportReason,
      details: reportDetails.trim() || undefined,
    });
    if (!parsed.success) {
      setReportError(parsed.error.issues[0]?.message ?? 'Choose a reason for the report.');
      return;
    }

    setIsReporting(true);
    setReportError(null);
    try {
      const response = await api.api.reports.projects[':id'].$post({
        param: { id: projectId },
        json: parsed.data,
      });
      if (!response.ok) throw new Error('Could not report project.');

      const result = projectReportResponseSchema.safeParse(await response.json());
      if (!result.success) throw new Error('Invalid project report response.');
      setIsReported(true);
      setReportOpen(false);
    } catch {
      setReportError('Could not send your report. Please try again.');
    } finally {
      setIsReporting(false);
    }
  }

  const saveLabel = isSaved ? 'Remove saved project' : 'Save project';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {isSessionPending || isSaveStateLoading ? (
          <Button
            type="button"
            variant="secondary"
            size="compact"
            className="flex-1"
            disabled
            aria-label="Loading saved project state"
          >
            <Bookmark aria-hidden data-icon="inline-start" />
            {visibleSaveCount > 0 ? visibleSaveCount : 'Save'}
          </Button>
        ) : session ? (
          <Button
            type="button"
            variant={isSaved ? 'default' : 'secondary'}
            size="compact"
            className="flex-1"
            aria-pressed={isSaved}
            aria-label={saveLabel}
            disabled={isSaving}
            onClick={toggleSaved}
          >
            <Bookmark
              aria-hidden
              data-icon="inline-start"
              fill={isSaved ? 'currentColor' : 'none'}
            />
            {isSaving
              ? 'Saving…'
              : visibleSaveCount > 0
                ? visibleSaveCount
                : isSaved
                  ? 'Saved'
                  : 'Save'}
          </Button>
        ) : (
          <Button asChild variant="secondary" size="compact" className="flex-1">
            <Link href={loginHref} aria-label="Sign in to save project">
              <Bookmark aria-hidden data-icon="inline-start" />
              {visibleSaveCount > 0 ? visibleSaveCount : 'Save'}
            </Link>
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="compact"
          className="flex-1"
          aria-label={shareStatus === 'copied' ? 'Project link copied' : 'Share project'}
          onClick={shareProject}
        >
          {shareStatus === 'copied' ? (
            <Check aria-hidden data-icon="inline-start" />
          ) : (
            <Share2 aria-hidden data-icon="inline-start" />
          )}
        </Button>

        {session ? (
          <Dialog open={reportOpen} onOpenChange={setReportOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="compact"
                className="flex-1"
                aria-label={isReported ? 'Project reported' : 'Report project'}
                aria-pressed={isReported}
                disabled={isReported}
              >
                {isReported ? (
                  <Check aria-hidden data-icon="inline-start" />
                ) : (
                  <Flag aria-hidden data-icon="inline-start" />
                )}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form className="grid gap-5" onSubmit={submitReport}>
                <DialogHeader>
                  <DialogTitle>Report this project</DialogTitle>
                  <DialogDescription>
                    Tell us what is wrong. Reports are private and reviewed by the Tickif team.
                  </DialogDescription>
                </DialogHeader>
                <SelectField
                  label="Reason"
                  placeholder="Choose a reason"
                  options={REPORT_REASONS}
                  value={reportReason}
                  onValueChange={(value) => {
                    const parsedReason = projectReportReasonSchema.safeParse(value);
                    if (parsedReason.success) setReportReason(parsedReason.data);
                  }}
                  disabled={isReporting}
                />
                <div className="space-y-1.5">
                  <Label htmlFor={reportDetailsId}>Details</Label>
                  <Textarea
                    id={reportDetailsId}
                    value={reportDetails}
                    onChange={(event) => setReportDetails(event.target.value)}
                    placeholder="Add useful context for our review team"
                    maxLength={500}
                    disabled={isReporting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Required only when choosing “Something else”.
                  </p>
                </div>
                {reportError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {reportError}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="neutral"
                    onClick={() => setReportOpen(false)}
                    disabled={isReporting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="inverted" disabled={isReporting}>
                    {isReporting ? <Loader2 aria-hidden className="animate-spin" /> : null}
                    Send report
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : (
          <Button asChild variant="secondary" size="compact" className="flex-1">
            <Link href={loginHref} aria-label="Sign in to report project">
              <Flag aria-hidden data-icon="inline-start" />
            </Link>
          </Button>
        )}
      </div>
      {saveError ? (
        <p role="status" className="text-xs text-destructive">
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
