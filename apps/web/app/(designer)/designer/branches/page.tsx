import { DesignerBranches } from '@/components/designer-branches';
import { getBranchesData } from '@/lib/branches-data';
import { requireAuth } from '@/lib/auth-guard';

export const metadata = {
  title: 'Branches · Tickif',
};

export default async function DesignerBranchesPage() {
  await requireAuth({ requiredRole: 'designer' });
  const data = await getBranchesData();
  return (
    <DesignerBranches
      key={data.workspace?.organization.id}
      branches={data.branches}
      branchesPage={data.branchesPage}
      workspace={data.workspace}
      error={data.error}
      serverLists
    />
  );
}
