import { DesignerCloseStudio } from '@/components/designer-close-studio';
import { DesignerPortfolioSettings } from '@/components/designer-portfolio-settings';
import {
  getCurrentOrgCapabilities,
  getCurrentOrgIdentity,
  getCurrentOrgRole,
} from '@/lib/current-org-role';
import { redirect } from 'next/navigation';
import { resolveProfileExperience } from '@repo/contracts';
import { getCurrentDesignerProfile } from '@/lib/designer-profile';

export const metadata = {
  title: 'Portfolio · Tickif',
};

export default async function DesignerPortfolioPage() {
  const [capabilities, role] = await Promise.all([
    getCurrentOrgCapabilities(),
    getCurrentOrgRole(),
  ]);
  if (!capabilities || (!capabilities.editOrganization && role !== 'owner'))
    redirect('/unauthorized');
  const organization = await getCurrentOrgIdentity();
  const profile = capabilities.editOrganization ? await getCurrentDesignerProfile() : null;
  return (
    <>
      {capabilities.editOrganization ? (
        <DesignerPortfolioSettings
          previewStats={
            profile
              ? {
                  yearsExperience: resolveProfileExperience(profile),
                  projectCount: profile.projectCount,
                }
              : undefined
          }
        />
      ) : null}
      {organization && role === 'owner' ? (
        <DesignerCloseStudio
          key={organization.id}
          organizationSlug={organization.slug}
          organizationName={organization.name}
        />
      ) : null}
    </>
  );
}
