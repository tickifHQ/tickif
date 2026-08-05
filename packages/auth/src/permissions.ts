import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access';
import { PLATFORM_ROLE, type PlatformRole } from '@repo/contracts';

export type { PlatformRole } from '@repo/contracts';

/**
 * better-auth access control for the admin plugin (E-87).
 *
 * Statements stay better-auth's defaults (user/session admin operations): app-level
 * permissions (taxonomy CRUD, project ownership, ...) are enforced by the Hono guards
 * in apps/api, not by better-auth hasPermission — one source of truth.
 */
export const statement = defaultStatements;

export const ac = createAccessControl(statement);

/**
 * The 4 platform roles (must stay in sync with the user_role pgEnum, see ADR 0001).
 * visitor/designer hold no admin-API permissions; admin/superadmin get the full
 * user/session admin set.
 */
export const roles = {
  [PLATFORM_ROLE.VISITOR]: ac.newRole({ user: [], session: [] }),
  [PLATFORM_ROLE.DESIGNER]: ac.newRole({ user: [], session: [] }),
  [PLATFORM_ROLE.ADMIN]: ac.newRole({ ...adminAc.statements }),
  [PLATFORM_ROLE.SUPERADMIN]: ac.newRole({ ...adminAc.statements }),
} satisfies Record<PlatformRole, ReturnType<typeof ac.newRole>>;
