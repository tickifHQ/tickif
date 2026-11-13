import type { Ref } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';

/** Shown once a save is rejected because another tab or teammate saved this project first. */
export function ProjectEditConflictAlert({ ref }: { ref?: Ref<HTMLDivElement> }) {
  return (
    <Alert ref={ref} variant="destructive" className="mt-6">
      <AlertCircle className="size-4" />
      <AlertTitle>This project changed in another tab</AlertTitle>
      <AlertDescription>
        <span>
          It was saved from another tab or by a teammate, so saving here is paused to avoid
          overwriting their changes. Reload to edit the latest version. Unsaved changes in this tab
          will be lost.
        </span>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => window.location.reload()}
        >
          Reload project
        </Button>
      </AlertDescription>
    </Alert>
  );
}
