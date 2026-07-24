export { db, type DB } from './client.js';
export * as schema from './schema/index.js';

// Re-export commonly used drizzle operators so consumers don't depend on
// drizzle-orm directly for simple queries.
export { eq, and, or, ne, inArray, isNotNull, isNull, lt, lte, desc, asc, sql } from 'drizzle-orm';
