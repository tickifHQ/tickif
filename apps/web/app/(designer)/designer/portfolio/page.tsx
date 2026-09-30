import { DesignerCloseStudio } from '@/components/designer-close-studio';
import { DesignerPortfolioSettings } from '@/components/designer-portfolio-settings';
import { getCurrentOrgCapabilities, getCurrentOrgIdentity } from '@/lib/current-org-role';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Portfolio · Tickif',
};

export default async function DesignerPortfolioPage() {
  const capabilities = await getCurrentOrgCapabilities();
  if (!capabilities?.editOrganization) redirect('/unauthorized');
  const organization = await getCurrentOrgIdentity();
  return (
    <>
      <DesignerPortfolioSettings />
      {organization ? (
        <DesignerCloseStudio
          key={organization.id}
          organizationSlug={organization.slug}
          organizationName={organization.name}
        />
      ) : null}
    </>
  );
}
