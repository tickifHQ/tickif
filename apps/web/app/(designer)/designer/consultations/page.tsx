import { redirect } from 'next/navigation';
import { config } from '@repo/config/features';
import { ConsultationsPage } from '@/components/consultations-page';

export function generateMetadata() {
  return { title: config.CONSULTATIONS_ENABLED ? 'Consultations · Tickif' : 'Leads · Tickif' };
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  if (!config.CONSULTATIONS_ENABLED) return redirect('/designer/leads');
  return <ConsultationsPage scope="inbox" searchParams={searchParams} />;
}
