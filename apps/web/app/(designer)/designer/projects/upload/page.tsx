import { DesignerProjectUpload } from '@/components/designer-project-upload';
import { requireAuth } from '@/lib/auth-guard';

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
  await requireAuth({ requiredRole: 'designer' });
  const params = await searchParams;

  return <DesignerProjectUpload initialProjectId={params.projectId} />;
}
