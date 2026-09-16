import { PLATFORM_ROLE } from '@repo/contracts';
import { redirect } from 'next/navigation';
import { DesignerProjectUpload } from '@/components/designer-project-upload';
import { requireAuth } from '@/lib/auth-guard';
import { getCurrentOrgCapabilities } from '@/lib/current-org-role';

export const metadata = {
  title: 'Upload project · Tickif',
};

type DesignerProjectUploadPageProps = {
  searchParams: Promise<{
    projectId?: string;
  }>;
};

export default async function DesignerProjectUploadPage({
  searchParams,
}: DesignerProjectUploadPageProps) {
  await requireAuth({ requiredRole: PLATFORM_ROLE.DESIGNER });
  const capabilities = await getCurrentOrgCapabilities();
  if (!capabilities?.writeProjects) redirect('/unauthorized');
  const params = await searchParams;

  return <DesignerProjectUpload initialProjectId={params.projectId} />;
}
