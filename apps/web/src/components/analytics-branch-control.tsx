'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { organizationBranchesResponseSchema } from '@repo/contracts';
import { SelectField } from '@repo/ui/components/select-field';
import { api } from '@/lib/api';

type BranchOption = { id: string; name: string };

/**
 * Branch picker for the analytics page. Options come from the branches
 * endpoint rather than the analytics response because the response scopes
 * its breakdown list down once a branch is selected, which would collapse
 * the picker to the roll-up alone. Mirrors the shell branch switcher.
 */
export function AnalyticsBranchControl() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isPending, startTransition] = useTransition();
  const activeBranchId = searchParams.get('branchId') ?? '';

  useEffect(() => {
    let cancelled = false;
    async function loadBranches() {
      try {
        const response = await api.api.orgs.branches.$get();
        if (!response.ok || cancelled) return;
        const parsed = organizationBranchesResponseSchema.safeParse(await response.json());
        if (!parsed.success || cancelled) return;
        setBranches(
          parsed.data.branches
            .filter((branch) => !branch.frozen)
            .map((branch) => ({ id: branch.id, name: branch.name })),
        );
      } catch {
        if (!cancelled) setBranches([]);
      }
    }
    void loadBranches();
    return () => {
      cancelled = true;
    };
  }, []);

  function selectBranch(value: string) {
    if (value === activeBranchId) return;

    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('branchId', value);
    else params.delete('branchId');
    const query = params.toString();

    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  if (branches.length === 0) return null;

  return (
    <SelectField
      label="Branch"
      value={activeBranchId}
      placeholder="Organization roll-up"
      allowEmpty
      options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
      className="w-52 space-y-0 [&_label]:sr-only [&_select]:h-8 [&_select]:px-2 [&_select]:py-1 [&_select]:pr-8"
      disabled={isPending}
      onValueChange={selectBranch}
    />
  );
}
