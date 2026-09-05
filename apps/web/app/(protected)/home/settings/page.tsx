import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { personalAccountSchema } from '@repo/contracts';
import { PublicHeader } from '@/components/public-header';
import { PersonalSettingsForm } from '@/components/personal-settings-form';
import { requireAuth } from '@/lib/auth-guard';
import { api } from '@/lib/api';

export const metadata = { title: 'Personal settings · Tickif' };

export default async function PersonalSettingsPage() {
  const session = await requireAuth({ requiredContext: 'personal' });
  const cookie = (await headers()).get('cookie') ?? '';
  const response = await api.api['personal-account'].me.$get(
    {},
    { headers: { cookie }, init: { cache: 'no-store' } },
  );
  if (response.status === 401) redirect('/login');
  if (response.status === 403) redirect('/unauthorized');
  if (!response.ok) throw new Error('Unable to load personal settings');
  const parsed = personalAccountSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Unable to load personal settings');
  return (
    <>
      <PublicHeader isAuthenticated userRole={session.user.role} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-10 sm:px-8">
        <Link href="/home" className="text-sm text-muted-foreground underline underline-offset-4">
          Back to My Tickif
        </Link>
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-medium">Personal settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your personal details. Your studio profile and organization settings are managed
            separately.
          </p>
        </header>
        <PersonalSettingsForm initialAccount={parsed.data} />
      </main>
    </>
  );
}
