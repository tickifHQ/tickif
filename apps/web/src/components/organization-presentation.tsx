import type { OrganizationMemberRole } from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';

export const organizationRoleLabels: Record<OrganizationMemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  billing_admin: 'Billing Admin',
  member: 'Member',
  viewer: 'Viewer',
};

const roleBadgeStyles: Record<OrganizationMemberRole, string> = {
  owner: 'bg-secondary text-secondary-foreground',
  admin: 'bg-info/10 text-info',
  billing_admin: 'bg-feature/10 text-feature',
  member: 'bg-success-lighter text-success',
  viewer: 'bg-muted text-muted-foreground',
};

export function formatSeatLimit(limit: number): string {
  if (!Number.isFinite(limit) || limit < 0) return 'Unlimited';
  return String(limit);
}

export function OrganizationRoleBadge({ role }: { role: OrganizationMemberRole }) {
  return (
    <Badge
      shape="square"
      className={`border-transparent px-2.5 py-1 text-xs leading-relaxed ${roleBadgeStyles[role]}`}
    >
      {organizationRoleLabels[role]}
    </Badge>
  );
}
