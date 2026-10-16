'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminCompanySearchResponse } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { fetchAdminCompanyOptions } from '@/lib/admin-visibility-api';

export function AdminCompanyFilter({
  value,
  name,
  designerId,
}: {
  value?: string;
  name?: string;
  designerId?: string;
}) {
  const [selected, setSelected] = useState({
    id: value ?? '',
    name: name ?? (value ? 'Selected company' : 'All companies'),
  });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AdminCompanySearchResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timeout = setTimeout(() => {
      void fetchAdminCompanyOptions(
        { q: q.trim() || undefined, page, limit: 25 },
        undefined,
        controller.signal,
      )
        .then((data) => {
          if (!controller.signal.aborted) setResult(data);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError('Companies could not be loaded. Close and reopen to retry.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [open, q, page]);
  const choose = (id: string, companyName: string) => {
    setSelected({ id, name: companyName });
    if (details.current) {
      details.current.open = false;
      details.current.querySelector('summary')?.focus();
    }
    setOpen(false);
  };
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium" id="admin-company-label">
        Company
      </span>
      <input type="hidden" name="organizationId" value={selected.id} />
      {designerId && selected.id === (value ?? '') ? (
        <input type="hidden" name="designerId" value={designerId} />
      ) : null}
      <details
        ref={details}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary')?.focus();
            setOpen(false);
          }
        }}
        className="relative"
      >
        <summary
          aria-labelledby="admin-company-label admin-company-value"
          className="cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <span id="admin-company-value">{selected.name}</span>
        </summary>
        {open ? (
          <div className="absolute z-20 mt-1 w-80 max-w-[85vw] space-y-2 rounded-md border bg-popover p-3 text-popover-foreground shadow-md">
            <Input
              aria-label="Search companies"
              maxLength={120}
              onKeyDown={(event) => {
                // Company search is local to this picker, not a filter-form submission.
                if (event.key === 'Enter') event.preventDefault();
              }}
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(1);
              }}
              placeholder="Search company name"
            />
            <Button type="button" variant="ghost" onClick={() => choose('', 'All companies')}>
              All companies
            </Button>
            <div role="status" className="text-sm text-muted-foreground">
              {loading
                ? 'Loading companies…'
                : error || (result?.items.length === 0 ? 'No companies found.' : '')}
            </div>
            {!loading && !error && result ? (
              <>
                <ul className="max-h-56 overflow-y-auto" aria-label="Companies">
                  {result.items.map((company) => (
                    <li key={company.id}>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full justify-start whitespace-normal text-left"
                        onClick={() => choose(company.id, company.name)}
                      >
                        {company.name}
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous companies
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= result.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    More companies
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </details>
    </div>
  );
}
