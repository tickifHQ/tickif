import { notFound } from 'next/navigation';
import { DesignerBranches } from '@/components/designer-branches';
import { getBranchesData } from '@/lib/branches-data';
import { requireAuth } from '@/lib/auth-guard';

export const metadata = { title: 'Branch members · Tickif' };

export default async function DesignerBranchPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  await requireAuth({ requiredRole: 'designer' });
  const { branchId } = await params;
  const data = await getBranchesData(branchId);
  if (data.notFound) notFound();
  return (
    <DesignerBranches
      key={`${data.workspace?.organization.id}:${branchId}`}
      branchId={branchId}
      branches={data.branches}
      workspace={data.workspace}
      error={data.error}
      serverLists
    />
  );
}
