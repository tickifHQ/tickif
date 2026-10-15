'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PencilLine, X } from 'lucide-react';
import {
  visitorFeedPreferencesResponseSchema,
  type VisitorFeedPreferencesResponse,
} from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/dialog';
import { api } from '@/lib/api';
import { readApiErrorMessage } from '@/lib/api-response';
import { visitorFeedHref } from '@/lib/visitor-feed';
import { VisitorOnboardingForm } from '@/components/visitor-onboarding-form';

/** Personal-context preference editing without leaving the discovery page. */
export function VisitorCustomizationDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<VisitorFeedPreferencesResponse | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await api.api.visitors.me['feed-preferences'].$get(
          {},
          { init: { signal: controller.signal, cache: 'no-store' } },
        );
        if (!response.ok)
          throw new Error(
            await readApiErrorMessage(response, 'Could not load your customization.'),
          );
        const parsed = visitorFeedPreferencesResponseSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('Could not load your customization.');
        if (!controller.signal.aborted) setSaved(parsed.data);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Could not load your customization.');
      }
    }
    void load();
    return () => controller.abort();
  }, [open, attempt]);

  function changeOpen(next: boolean) {
    if (saving) return;
    setSaved(null);
    setError('');
    setOpen(next);
  }

  function complete(result: VisitorFeedPreferencesResponse) {
    setOpen(false);
    setSaved(null);
    const href = visitorFeedHref(result.filters);
    // Same-URL saves still refresh server-rendered defaults and suggestions.
    if (window.location.pathname + window.location.search === href) router.refresh();
    else router.replace(href, { scroll: false });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="muted-link" size="inline">
          <PencilLine aria-hidden data-icon="inline-start" />
          Edit customization
        </Button>
      </DialogTrigger>
      <DialogContent
        overlayClassName="bg-account-menu-overlay"
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        {saved ? (
          <VisitorOnboardingForm
            mode="edit"
            initialPreferences={saved.preferences}
            onCancel={() => changeOpen(false)}
            onSaved={complete}
            onSavingChange={setSaving}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Edit customization</DialogTitle>
              <DialogDescription>
                Update your home and location to tune the projects in your feed.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <div className="flex flex-col items-start gap-3">
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setError('');
                    setAttempt((value) => value + 1);
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                Loading your customization…
              </p>
            )}
          </>
        )}
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close customization"
            disabled={saving}
            className="absolute right-3 top-3"
          >
            <X aria-hidden />
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
