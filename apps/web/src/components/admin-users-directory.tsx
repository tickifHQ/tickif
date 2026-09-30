'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { AccountStatus, AdminUserActivityResponse, AdminUsersResponse } from '@repo/contracts';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Avatar, AvatarFallback } from '@repo/ui/components/avatar';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@repo/ui/components/dialog';
import { EmptyState } from '@repo/ui/components/empty-state';
import { Skeleton } from '@repo/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/components/tabs';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  FolderKanban,
  Mail,
  Phone,
  RefreshCw,
  Search,
  UserRoundSearch,
  UsersRound,
} from 'lucide-react';
import { UrlListPagination } from '@/components/list-pagination';
import { PlatformRoleBadge } from '@/components/platform-role-badge';
import { fetchAdminUserActivity } from '@/lib/admin-activity-api';

type UserItem = AdminUsersResponse['items'][number];

const statusLabels: Record<AccountStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  suspended: 'Suspended',
  deleted: 'Deleted',
};

function statusVariant(status: AccountStatus) {
  if (status === 'active') return 'success' as const;
  if (status === 'pending') return 'warning' as const;
  if (status === 'suspended' || status === 'deleted') return 'destructive' as const;
  return 'secondary' as const;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function ActivityMetric({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted/70 px-2 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

function HistoryEmpty({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <EmptyState
      className="py-14"
      icon={icon}
      title={title}
      description="No recent recorded activity is available for this user."
    />
  );
}

function HistoryList({ children }: { children: ReactNode }) {
  return <ul className="divide-y rounded-xl border bg-card">{children}</ul>;
}

function ActivityDetail({
  user,
  activity,
}: {
  user: UserItem;
  activity: AdminUserActivityResponse;
}) {
  return (
    <div className="min-h-full bg-muted/20">
      <header className="border-b bg-card px-5 py-6 sm:px-7">
        <div className="flex items-start gap-4 pr-8">
          <Avatar className="size-12">
            <AvatarFallback>{initials(user.name) || '?'}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold text-foreground">{user.name}</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PlatformRoleBadge role={user.role} />
              <Badge variant={statusVariant(user.status)}>{statusLabels[user.status]}</Badge>
              {user.banned ? <Badge variant="destructive">Banned</Badge> : null}
            </div>
          </div>
        </div>
        <div className="mt-5 rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-sm font-medium text-foreground">Recent recorded activity</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Up to 100 recent entries are shown per activity type. Search history is retained for up
            to 180 days, so these records are not lifetime totals.
          </p>
        </div>
      </header>

      <div className="p-5 sm:p-7">
        <Tabs defaultValue="searches">
          <div className="max-w-full overflow-x-auto pb-1">
            <TabsList aria-label="User activity types">
              <TabsTrigger value="searches">
                Searches{' '}
                <span className="text-xs text-muted-foreground">{activity.searches.length}</span>
              </TabsTrigger>
              <TabsTrigger value="projects">
                Projects{' '}
                <span className="text-xs text-muted-foreground">
                  {activity.projectViews.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="profiles">
                Profiles{' '}
                <span className="text-xs text-muted-foreground">
                  {activity.profileViews.length}
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="searches" className="mt-4">
            {activity.searches.length > 0 ? (
              <HistoryList>
                {activity.searches.map((item, index) => (
                  <li key={`${item.endpoint}-${item.createdAt}-${index}`} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Badge variant="secondary" className="mb-2 capitalize">
                          {item.endpoint}
                        </Badge>
                        <p className="break-words text-sm font-medium text-foreground">
                          {item.query || 'Empty query'}
                        </p>
                      </div>
                      <time
                        dateTime={item.createdAt}
                        className="shrink-0 text-xs text-muted-foreground"
                      >
                        {formatDate(item.createdAt)}
                      </time>
                    </div>
                  </li>
                ))}
              </HistoryList>
            ) : (
              <HistoryEmpty icon={<Search className="size-5" />} title="No recorded searches" />
            )}
          </TabsContent>

          <TabsContent value="projects" className="mt-4">
            {activity.projectViews.length > 0 ? (
              <HistoryList>
                {activity.projectViews.map((item) => (
                  <li key={`${item.projectId}-${item.createdAt}`} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          Project {item.projectId}
                        </p>
                      </div>
                      <time
                        dateTime={item.createdAt}
                        className="shrink-0 text-xs text-muted-foreground"
                      >
                        {formatDate(item.createdAt)}
                      </time>
                    </div>
                  </li>
                ))}
              </HistoryList>
            ) : (
              <HistoryEmpty
                icon={<FolderKanban className="size-5" />}
                title="No recorded project views"
              />
            )}
          </TabsContent>

          <TabsContent value="profiles" className="mt-4">
            {activity.profileViews.length > 0 ? (
              <HistoryList>
                {activity.profileViews.map((item) => (
                  <li key={`${item.designerProfileId}-${item.createdAt}`} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.displayName}
                        </p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          Profile {item.designerProfileId}
                        </p>
                      </div>
                      <time
                        dateTime={item.createdAt}
                        className="shrink-0 text-xs text-muted-foreground"
                      >
                        {formatDate(item.createdAt)}
                      </time>
                    </div>
                  </li>
                ))}
              </HistoryList>
            ) : (
              <HistoryEmpty
                icon={<UserRoundSearch className="size-5" />}
                title="No recorded profile views"
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-label="Loading user activity">
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-9 w-72 max-w-full" />
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}

export function AdminUsersDirectory({
  users,
  error,
}: {
  users: AdminUsersResponse;
  error?: string;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [activity, setActivity] = useState<AdminUserActivityResponse | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const requestRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const activityTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(
    () => () => {
      requestRef.current++;
      selectedIdRef.current = null;
    },
    [],
  );

  async function openActivity(user: UserItem, trigger?: HTMLButtonElement) {
    const request = ++requestRef.current;
    selectedIdRef.current = user.id;
    if (trigger) activityTriggerRef.current = trigger;
    setSelectedUser(user);
    setActivity(null);
    setActivityError(null);
    setLoadingActivity(true);

    try {
      const next = await fetchAdminUserActivity(user.id);
      if (request === requestRef.current && selectedIdRef.current === user.id) setActivity(next);
    } catch (caught) {
      if (request === requestRef.current && selectedIdRef.current === user.id) {
        setActivityError(
          caught instanceof Error ? caught.message : 'Could not load this user activity.',
        );
      }
    } finally {
      if (request === requestRef.current && selectedIdRef.current === user.id) {
        setLoadingActivity(false);
      }
    }
  }

  function closeActivity() {
    requestRef.current++;
    selectedIdRef.current = null;
    setSelectedUser(null);
    setActivity(null);
    setActivityError(null);
    setLoadingActivity(false);
  }

  return (
    <>
      {error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>User directory unavailable</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => startRefresh(() => router.refresh())}
            >
              <RefreshCw
                className={refreshing ? 'size-4 animate-spin' : 'size-4'}
                aria-hidden="true"
              />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <Table className="min-w-[60rem]">
            <TableHeader>
              <TableRow className="bg-muted/35 hover:bg-muted/35">
                <TableHead className="min-w-64">User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="min-w-80">Activity totals</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="sticky right-0 border-l bg-muted text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.items.length > 0 ? (
                users.items.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-start gap-3">
                        <Avatar>
                          <AvatarFallback>{initials(user.name) || '?'}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{user.name}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            <Mail className="size-3" aria-hidden="true" />
                            {user.email}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="size-3" aria-hidden="true" />
                            {user.phoneNumber ?? 'No phone number'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PlatformRoleBadge role={user.role} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1.5">
                        <Badge variant={statusVariant(user.status)}>
                          {statusLabels[user.status]}
                        </Badge>
                        {user.banned ? <Badge variant="destructive">Banned</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-nowrap gap-1.5 whitespace-nowrap">
                        <ActivityMetric label="Searches" value={user.searches} />
                        <ActivityMetric label="Projects" value={user.projectViews} />
                        <ActivityMetric label="Profiles" value={user.profileViews} />
                        <ActivityMetric label="Enquiries" value={user.enquiries} />
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {user.lastActiveAt ? formatDate(user.lastActiveAt) : 'No recorded activity'}
                    </TableCell>
                    <TableCell className="sticky right-0 border-l bg-card text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(event) => void openActivity(user, event.currentTarget)}
                        aria-label={`View recent activity for ${user.name}`}
                      >
                        View activity
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-16">
                    <EmptyState
                      icon={<UsersRound className="size-5" />}
                      title="No users found"
                      description="No accounts match the current search and filters."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {!error && users.totalPages > 1 ? (
        <UrlListPagination
          page={users.page}
          totalPages={users.totalPages}
          total={users.total}
          limit={users.limit}
          itemName="user"
          pageSizes={[25, 50, 100]}
          className="mt-5"
        />
      ) : null}

      <Dialog open={selectedUser !== null} onOpenChange={(open) => !open && closeActivity()}>
        <DialogContent
          className="left-auto right-0 top-0 h-dvh max-h-none w-full max-w-3xl translate-x-0 translate-y-0 grid-cols-1 gap-0 overflow-y-auto rounded-none border-y-0 border-r-0 p-0 sm:max-w-3xl"
          overlayClassName="bg-foreground/30"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            activityTriggerRef.current?.focus();
          }}
        >
          <DialogTitle className="sr-only">User activity</DialogTitle>
          <DialogDescription className="sr-only">
            Review this user&apos;s recent recorded searches and views.
          </DialogDescription>
          {loadingActivity ? (
            <DetailSkeleton />
          ) : activityError ? (
            <div className="flex min-h-96 flex-col items-center justify-center gap-3 px-8 text-center">
              <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
              <p className="text-sm font-medium text-destructive">{activityError}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => selectedUser && void openActivity(selectedUser)}
              >
                Try again
              </Button>
            </div>
          ) : selectedUser && activity ? (
            <ActivityDetail user={selectedUser} activity={activity} />
          ) : (
            <div className="flex min-h-96 items-center justify-center text-sm text-muted-foreground">
              <Activity className="mr-2 size-4" aria-hidden="true" />
              Select a user to review activity.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
