'use client';

import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useState } from 'react';
import Image from 'next/image';

const TRANSITION_DURATION_MS = 520;
const STORAGE_PREFIX = 'tickif:dashboard-right-rail:v1';

type CompletionSnapshot = {
  projectDone: boolean;
  nextStepsDone: boolean;
};

function readSnapshot(key: string): CompletionSnapshot | null {
  try {
    const value = window.sessionStorage.getItem(key);
    if (!value) return null;

    const parsed = JSON.parse(value) as Partial<CompletionSnapshot>;
    if (typeof parsed.projectDone !== 'boolean' || typeof parsed.nextStepsDone !== 'boolean') {
      return null;
    }

    return {
      projectDone: parsed.projectDone,
      nextStepsDone: parsed.nextStepsDone,
    };
  } catch {
    return null;
  }
}

function writeSnapshot(key: string, snapshot: CompletionSnapshot) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // The dashboard remains fully usable when storage is unavailable.
  }
}

function AnimatedRegion({
  open,
  testId,
  children,
}: {
  open: boolean;
  testId: string;
  children: ReactNode;
}) {
  const [present, setPresent] = useState(open);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }

    const timeout = window.setTimeout(() => setPresent(false), TRANSITION_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [open]);

  if (!present) return null;

  return (
    <div
      data-testid={testId}
      data-state={open ? 'open' : 'closed'}
      aria-hidden={!open}
      className={[
        'grid transition-[grid-template-rows,opacity,transform] duration-500 ease-out motion-reduce:transition-none',
        open
          ? 'grid-rows-[1fr] translate-y-0 opacity-100'
          : 'pointer-events-none grid-rows-[0fr] -translate-y-2 opacity-0',
      ].join(' ')}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="pb-5">{children}</div>
      </div>
    </div>
  );
}

export function DashboardRightRailTransition({
  workspaceKey,
  projectDone,
  nextStepsDone,
  setupCard,
  nextStepsCard,
  shareCard,
}: {
  workspaceKey: string;
  projectDone: boolean;
  nextStepsDone: boolean;
  setupCard: ReactNode;
  nextStepsCard: ReactNode;
  shareCard: ReactNode;
}) {
  const showSetup = !projectDone;
  const showNextSteps = !nextStepsDone;
  const [setupOpen, setSetupOpen] = useState(showSetup);
  const [nextStepsOpen, setNextStepsOpen] = useState(showNextSteps);
  const share = (
    <div
      data-testid="dashboard-share-card"
      className="transition-transform duration-500 ease-out motion-reduce:transition-none"
    >
      {shareCard}
    </div>
  );

  useLayoutEffect(() => {
    const storageKey = `${STORAGE_PREFIX}:${workspaceKey}`;
    const previous = readSnapshot(storageKey);
    const current = { projectDone, nextStepsDone };

    writeSnapshot(storageKey, current);

    const setupJustCompleted = previous?.projectDone === false && projectDone;
    const nextStepsJustCompleted = previous?.nextStepsDone === false && nextStepsDone;

    if (!setupJustCompleted && !nextStepsJustCompleted) {
      setSetupOpen(showSetup);
      setNextStepsOpen(showNextSteps);
      return;
    }

    setSetupOpen(setupJustCompleted ? true : showSetup);
    setNextStepsOpen(nextStepsJustCompleted ? true : showNextSteps);

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setSetupOpen(showSetup);
        setNextStepsOpen(showNextSteps);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [nextStepsDone, projectDone, showNextSteps, showSetup, workspaceKey]);

  return (
    <div className="relative min-w-0">
      <Image
        src="/illustrations/onboarding-workspace-desk.svg"
        alt=""
        width={95}
        height={95}
        data-testid="dashboard-workspace-illustration"
        className="pointer-events-none absolute -top-[4.25rem] right-3 z-10 hidden h-auto w-28 select-none sm:block"
      />

      <AnimatedRegion open={setupOpen} testId="dashboard-complete-setup">
        {setupCard}
      </AnimatedRegion>
      <AnimatedRegion open={nextStepsOpen} testId="dashboard-next-steps">
        {nextStepsCard}
      </AnimatedRegion>
      {share}
    </div>
  );
}
