import type { PlatformRole } from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';

export const platformRoleLabels: Record<PlatformRole, string> = {
  visitor: 'Visitor',
  designer: 'Designer',
  admin: 'Admin',
  superadmin: 'Super admin',
};

const platformRoleBadgeStyles: Record<PlatformRole, string> = {
  visitor: 'bg-muted text-muted-foreground',
  designer: 'bg-success-lighter text-success',
  admin: 'bg-info/10 text-info',
  superadmin: 'bg-feature/10 text-feature',
};

export function PlatformRoleBadge({ role }: { role: PlatformRole }) {
  return (
    <Badge className={`border-transparent ${platformRoleBadgeStyles[role]}`}>
      {platformRoleLabels[role]}
    </Badge>
  );
}
