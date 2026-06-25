import { DesignerProjectUpload } from '@/components/designer-project-upload';
import { requireAuth } from '@/lib/auth-guard';

export const metadata = {
  title: 'Upload project · Tickif',
};

export default async function DesignerProjectUploadPage() {
  await requireAuth({ requiredRole: 'designer' });

  return <DesignerProjectUpload />;
}
