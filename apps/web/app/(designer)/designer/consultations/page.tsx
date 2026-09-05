import { ConsultationsPage } from '@/components/consultations-page';
export const metadata = { title: 'Consultations · Tickif' };
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  return <ConsultationsPage scope="inbox" searchParams={searchParams} />;
}
