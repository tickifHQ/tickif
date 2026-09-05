import { ConsultationsPage } from '@/components/consultations-page';
export const metadata = { title: 'My consultations · Tickif' };
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  return <ConsultationsPage scope="mine" searchParams={searchParams} />;
}
