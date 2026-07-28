/**
 * PostgreSQL advisory-lock namespace for search projection rebuild barriers.
 *
 * Domain transactions take the shared form before recording an outbox event.
 * A full rebuild briefly takes the exclusive form before and after its snapshot,
 * which closes the commit-order race without blocking normal writes for the
 * duration of the bulk import.
 */
export const SEARCH_PROJECTION_ADVISORY_LOCK_KEY = 20_020_026;
