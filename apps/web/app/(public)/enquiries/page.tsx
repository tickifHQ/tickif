import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth-guard';
import { EnquiriesPageClient } from '@/components/enquiries-page-client';

export const metadata = {
  title: 'Your Enquiries · Tickif',
};

export default async function EnquiriesPage() {
  const session = await getServerSession();
  if (!session) {
    redirect('/login?callbackURL=%2Fenquiries');
  }

  return <EnquiriesPageClient />;
}
