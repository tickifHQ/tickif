'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ACCOUNT_STATUS_VALUES,
  PLATFORM_ROLE_VALUES,
  type AccountStatus,
  type PlatformRole,
} from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { SelectField, type SelectFieldOption } from '@repo/ui/components/select-field';
import { RotateCcw, Search } from 'lucide-react';
import { platformRoleLabels } from '@/components/platform-role-badge';

const statusLabels: Record<AccountStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  suspended: 'Suspended',
  deleted: 'Deleted',
};

const roleOptions: readonly SelectFieldOption[] = PLATFORM_ROLE_VALUES.map((value) => ({
  value,
  label: platformRoleLabels[value],
}));

const statusOptions: readonly SelectFieldOption[] = ACCOUNT_STATUS_VALUES.map((value) => ({
  value,
  label: statusLabels[value],
}));

export function AdminUsersFilters({
  query,
}: {
  query: { q?: string; role?: PlatformRole; status?: AccountStatus };
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(query.q ?? '');
  const [navigating, startNavigation] = useTransition();
  const hasFilters = Boolean(query.q || query.role || query.status);

  function navigate(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.set('page', '1');
    const serialized = next.toString();
    startNavigation(() => router.push(serialized ? `${pathname}?${serialized}` : pathname));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ q: search.trim() || null });
  }

  function clearFilters() {
    setSearch('');
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    next.delete('role');
    next.delete('status');
    next.set('page', '1');
    startNavigation(() => router.push(`${pathname}?${next.toString()}`));
  }

  return (
    <div
      className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm lg:grid-cols-[minmax(18rem,1fr)_12rem_12rem_auto] lg:items-end"
      aria-busy={navigating}
    >
      <form onSubmit={submitSearch} className="space-y-1.5">
        <Label htmlFor="admin-user-search">Search users</Label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="admin-user-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, or phone"
              maxLength={120}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="outline" disabled={navigating}>
            Search
          </Button>
        </div>
      </form>
      <SelectField
        label="Role"
        placeholder="All roles"
        allowEmpty
        options={roleOptions}
        value={query.role ?? ''}
        disabled={navigating}
        onValueChange={(role) => navigate({ role: role || null })}
      />
      <SelectField
        label="Status"
        placeholder="All statuses"
        allowEmpty
        options={statusOptions}
        value={query.status ?? ''}
        disabled={navigating}
        onValueChange={(status) => navigate({ status: status || null })}
      />
      <Button
        type="button"
        variant="ghost"
        disabled={!hasFilters || navigating}
        onClick={clearFilters}
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        Clear
      </Button>
    </div>
  );
}
