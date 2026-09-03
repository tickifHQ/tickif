export { db, type DB } from './client.js';
export * as schema from './schema/index.js';
export { SEARCH_PROJECTION_ADVISORY_LOCK_KEY } from './search-projection.js';
export {
  freezeMembersToLimitOnTx,
  restoreMembersToLimitOnTx,
  selectMemberIdsToFreeze,
} from './member-freeze.js';
export type {
  ActiveMemberFreezeCandidate,
  DbTransaction,
  FreezeMembersToLimitInput,
  RestoreMembersToLimitInput,
} from './member-freeze.js';
export {
  expirePendingInvitations,
  expirePendingOwnershipTransfers,
  sweepOrgExpirations,
} from './org-expiry.js';

// Re-export commonly used drizzle operators so consumers don't depend on
// drizzle-orm directly for simple queries.
export {
  eq,
  and,
  or,
  ne,
  inArray,
  notInArray,
  isNotNull,
  isNull,
  lt,
  lte,
  gte,
  desc,
  asc,
  sql,
} from 'drizzle-orm';
