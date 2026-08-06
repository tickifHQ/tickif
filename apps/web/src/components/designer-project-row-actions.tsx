'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProjectStatus } from '@repo/contracts';
import {
  deleteProjectResponseSchema,
  duplicateProjectResponseSchema,
  projectDetailResponseSchema,
} from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { Copy, ExternalLink, MoreVertical, Pencil, Trash2, Undo2 } from 'lucide-react';
import { api } from '@/lib/api';

function canDeleteProject(status: ProjectStatus) {
  return status === 'draft' || status === 'changes_requested';
}

function canWithdrawProject(status: ProjectStatus) {
  return status === 'submitted';
}

export function DesignerProjectRowActions({
  projectId,
  projectTitle,
  projectStatus,
}: {
  projectId: string;
  projectTitle: string;
  projectStatus: ProjectStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Radix traps focus in the menu, so opening a dialog from a menu item has to
  // wait until the menu has finished closing. Holds which dialog to open next.
  const pendingDialogRef = useRef<'delete' | 'withdraw' | null>(null);
  const refreshAfterDeleteRef = useRef(false);
  const deleteEnabled = canDeleteProject(projectStatus);
  const withdrawEnabled = canWithdrawProject(projectStatus);

  function handleMenuOpenChange(open: boolean) {
    setMenuOpen(open);
    if (open || !pendingDialogRef.current) return;

    const pending = pendingDialogRef.current;
    pendingDialogRef.current = null;
    window.setTimeout(() => {
      if (pending === 'delete') setDeleteOpen(true);
      else setWithdrawOpen(true);
    }, 0);
  }

  function duplicateProject() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await api.api.projects[':id'].duplicate.$post({
          param: { id: projectId },
        });
        const payload: unknown = await response.json();
        const parsed = duplicateProjectResponseSchema.safeParse(payload);

        if (!response.ok || !parsed.success) {
          setError('Could not duplicate project.');
          return;
        }

        router.refresh();
      } catch {
        setError('Could not duplicate project.');
      }
    });
  }

  function deleteProject() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await api.api.projects[':id'].$delete({ param: { id: projectId } });
        const payload: unknown = await response.json();
        const parsed = deleteProjectResponseSchema.safeParse(payload);

        if (!response.ok || !parsed.success) {
          setError('Could not delete project.');
          return;
        }

        refreshAfterDeleteRef.current = true;
        setDeleteOpen(false);
      } catch {
        setError('Could not delete project.');
      }
    });
  }

  function withdrawProject() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await api.api.projects[':id'].withdraw.$post({ param: { id: projectId } });
        const payload: unknown = await response.json();
        const parsed = projectDetailResponseSchema.safeParse(payload);

        if (!response.ok || !parsed.success) {
          setError('Could not withdraw project.');
          return;
        }

        setWithdrawOpen(false);
        router.refresh();
      } catch {
        setError('Could not withdraw project.');
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={`Duplicate ${projectTitle}`}
        disabled={isPending}
        onClick={duplicateProject}
      >
        <Copy className="size-4" />
      </Button>
      <Button
        asChild
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={`Edit ${projectTitle}`}
      >
        <Link href={`/designer/projects/${projectId}/edit`}>
          <Pencil className="size-4" />
        </Link>
      </Button>

      <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`More actions for ${projectTitle}`}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem disabled>
            <ExternalLink className="size-4" />
            View public
          </DropdownMenuItem>
          {withdrawEnabled ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  pendingDialogRef.current = 'withdraw';
                }}
              >
                <Undo2 className="size-4" />
                Withdraw submission
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!deleteEnabled}
            onSelect={() => {
              if (deleteEnabled) pendingDialogRef.current = 'delete';
            }}
          >
            <Trash2 className="size-4" />
            Delete draft
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent
          onCloseAutoFocus={() => {
            if (!refreshAfterDeleteRef.current) return;
            refreshAfterDeleteRef.current = false;
            window.setTimeout(() => router.refresh(), 0);
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete project draft?</DialogTitle>
            <DialogDescription>
              This removes “{projectTitle}” from your drafts. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={deleteProject}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw this submission?</DialogTitle>
            <DialogDescription>
              “{projectTitle}” will return to Drafts so you can make changes before submitting it
              again.
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setWithdrawOpen(false)}
            >
              Keep submitted
            </Button>
            <Button type="button" disabled={isPending} onClick={withdrawProject}>
              {isPending ? 'Withdrawing…' : 'Withdraw submission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {error && !deleteOpen ? (
        <span className="sr-only" role="status">
          {error}
        </span>
      ) : null}
    </div>
  );
}
