import { DesignerPortfolioSettings } from '@/components/designer-portfolio-settings';
import { getCurrentOrgCapabilities } from '@/lib/current-org-role';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Portfolio · Tickif',
};

export default async function DesignerPortfolioPage() {
  const capabilities = await getCurrentOrgCapabilities();
  if (!capabilities?.editOrganization) redirect('/unauthorized');
  return <DesignerPortfolioSettings />;
}
