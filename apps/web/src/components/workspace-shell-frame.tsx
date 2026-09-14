'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@repo/ui/components/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@repo/ui/components/dialog';
import { Menu, X } from 'lucide-react';

export function WorkspaceShellFrame({
  navigationLabel,
  renderSidebar,
  headerTitle,
  headerActions,
  children,
  busy = false,
  busyFallback,
}: {
  navigationLabel: string;
  renderSidebar: () => ReactNode;
  headerTitle?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  busy?: boolean;
  busyFallback?: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-muted/30">
      <div className="flex h-full overflow-hidden bg-muted/20">
        <aside className="hidden h-full w-64 shrink-0 flex-col lg:flex">{renderSidebar()}</aside>

        <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <DialogContent
            aria-describedby={undefined}
            showCloseButton={false}
            overlayClassName="lg:hidden"
            className="left-0 top-0 flex h-full w-4/5 max-w-72 translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-l-0 border-r border-border bg-background p-0 shadow-xl lg:hidden"
          >
            <DialogTitle className="sr-only">{navigationLabel}</DialogTitle>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="Close navigation"
                autoFocus
                className="absolute right-4 top-4 inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </DialogClose>
            {renderSidebar()}
          </DialogContent>
        </Dialog>

        <div className="flex min-w-0 flex-1 flex-col p-2">
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between rounded-t-3xl border border-border/80 bg-background/80 px-6 backdrop-blur">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 cursor-pointer lg:hidden"
                aria-label="Open navigation"
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu className="size-4" aria-hidden="true" />
              </Button>
              {headerTitle}
            </div>
            <div className="flex items-center gap-2.5">{headerActions}</div>
          </header>
          <section className="min-h-0 flex-1 overflow-hidden rounded-b-3xl border-x border-b border-border/80 bg-background shadow-sm">
            <main className="h-full min-w-0 overflow-y-auto" aria-busy={busy}>
              {busy && busyFallback ? busyFallback : children}
            </main>
          </section>
        </div>
      </div>
    </div>
  );
}
