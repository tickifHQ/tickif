/**
 * Discovery module (E-195, E-267).
 *
 * Provides:
 * - GET /api/discovery/feed — Public discovery feed of published projects
 * - GET /api/discovery/similar/{id} — Similar published projects
 *
 * See ../README.md for the layering convention.
 */
export { discoveryRoutes, type DiscoveryRoutes } from './routes.js';
