'use client';

import { useEffect, useState } from 'react';
import { savedProjectStateSchema, savedProjectsStateResponseSchema } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Bookmark, Check, Share2 } from 'lucide-react';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useHydrated } from '@/lib/use-hydrated';
import { ProjectViewCount } from '@/components/project-view-count';
import { ActionLoginDialog } from '@/components/action-login-dialog';

export function ProjectActions({
  projectId,
  loginHref,
  canonicalUrl,
  presentation = 'default',
}: {
  projectId: string;
  loginHref: string;
  canonicalUrl: string;
  presentation?: 'default' | 'save';
}) {
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const hydrated = useHydrated();
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadedSaveStateKey, setLoadedSaveStateKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');
  const [loginOpen, setLoginOpen] = useState(false);
  const sessionUserId = session?.user.id ?? null;
  const saveStateKey = sessionUserId ? `${sessionUserId}:${projectId}` : null;
  const isSaveStateLoading = saveStateKey !== null && loadedSaveStateKey !== saveStateKey;

  // A project may appear in both the featured and recent landing feeds.
  useEffect(() => {
    const onSaved = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail?.userId !== sessionUserId) return;
      const parsed = savedProjectStateSchema.safeParse(event.detail?.project);
      if (parsed.success && parsed.data.projectId === projectId) setIsSaved(parsed.data.saved);
    };
    window.addEventListener('tickif:project-saved', onSaved);
    return () => window.removeEventListener('tickif:project-saved', onSaved);
  }, [projectId, sessionUserId]);

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
      setIsSaved(parsed.data.saved);
      window.dispatchEvent(
        new CustomEvent('tickif:project-saved', {
          detail: { userId: sessionUserId, project: parsed.data },
        }),
      );
    } catch {
      setSaveError('Could not update saved project. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function shareProject() {
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url: canonicalUrl });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(canonicalUrl);
      setShareStatus('copied');
      window.setTimeout(() => setShareStatus('idle'), 2000);
    } catch {
      setShareStatus('idle');
    }
  }

  const saveLabel = isSaved ? 'Remove saved project' : 'Save project';

  if (presentation === 'save')
    return (
      <div className="relative">
        <Button
          type="button"
          variant={isSaved ? 'default' : 'neutral'}
          size="icon"
          className="size-9 rounded-full bg-card text-foreground shadow-sm"
          aria-label={
            !hydrated || isSessionPending
              ? 'Save project'
              : !session
                ? 'Sign in to save project'
                : saveLabel
          }
          aria-pressed={isSaved}
          disabled={!hydrated || isSessionPending || isSaveStateLoading || isSaving}
          onClick={() => (session ? void toggleSaved() : setLoginOpen(true))}
        >
          <img
            src="/images/landing/bookmarks.svg"
            alt=""
            className="dark:brightness-0 dark:invert"
          />
          {isSaved ? (
            <span className="absolute -right-1 -top-1 size-3 rounded-full bg-primary" aria-hidden />
          ) : null}
        </Button>
        {saveError ? (
          <p
            role="status"
            className="absolute right-0 top-full z-10 mt-2 w-48 rounded-lg bg-card p-3 text-xs text-destructive shadow-sm"
          >
            {saveError}
          </p>
        ) : null}
        <ActionLoginDialog
          open={loginOpen}
          onOpenChange={setLoginOpen}
          loginHref={loginHref}
          presentation="landing"
        />
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        <ProjectViewCount projectId={projectId} />
        {!hydrated || isSessionPending || isSaveStateLoading ? (
          <Button
            type="button"
            variant="secondary"
            size="compact"
            className="flex-1"
            disabled
            aria-label="Loading saved project state"
          >
            <Bookmark aria-hidden data-icon="inline-start" />
            Save
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
            {isSaving ? 'Saving…' : isSaved ? 'Saved' : 'Save'}
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="compact"
            className="flex-1"
            aria-label="Sign in to save project"
            onClick={() => setLoginOpen(true)}
          >
            <Bookmark aria-hidden data-icon="inline-start" />
            Save
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
      </div>
      {saveError ? (
        <p role="status" className="text-xs text-destructive">
          {saveError}
        </p>
      ) : null}
      <ActionLoginDialog open={loginOpen} onOpenChange={setLoginOpen} loginHref={loginHref} />
    </div>
  );
}
