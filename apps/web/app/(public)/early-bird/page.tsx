import { redirect } from 'next/navigation';
import { earlyBirdTierSchema } from '@repo/contracts';
import { getServerSession } from '@/lib/auth-guard';
import { designerLoginPath } from '@/lib/auth-paths';

/** Keep the offer selection through sign-in and first-time studio setup. */
export default async function EarlyBirdEntry({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const selected = earlyBirdTierSchema.safeParse((await searchParams).plan);
  if (!selected.success) redirect('/#for-designers');
  const session = await getServerSession({ disableCookieCache: true });
  if (!session) redirect(designerLoginPath(`/early-bird?plan=${selected.data}`));
  if (session.user.role === 'designer') redirect(`/designer/early-bird?plan=${selected.data}`);
  if (session.user.role === 'visitor' && session.user.status === 'pending')
    redirect(`/designer/onboarding?earlyBird=${selected.data}`);
  if (session.user.role === 'visitor' && session.user.status === 'active')
    redirect('/home/list-your-work');
  redirect('/unauthorized');
}
