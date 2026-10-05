'use client';

import { useEffect } from 'react';
import { reportBrowserError } from '@/lib/logger.browser';

export function useReportBoundaryError(error: Error | undefined, component: string): void {
  useEffect(() => {
    if (error) reportBrowserError(error, component);
  }, [error, component]);
}
