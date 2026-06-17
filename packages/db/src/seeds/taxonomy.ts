/**
 * E-32 — Launch-market taxonomy seed (source of truth).
 *
 * Idempotent: upserts by (kind, slug) for non-locality, (parent_id, slug) for locality.
 * Updates: label, sortOrder, metadata on rerun.
 * Does NOT touch isActive (admin may have deactivated a term).
 * Removed terms stay in DB untouched (no automatic deactivation).
 *
 * Run: pnpm db:seed
 */

import { db, schema, sql } from '../index.js';

type TaxonomyKind = (typeof schema.taxonomyKindEnum.enumValues)[number];

type TermSeed = {
  kind: TaxonomyKind;
  slug: string;
  label: string;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
  parentSlug?: string;
};

// ─── CITIES ────────────────────────────────────────────────────────────────────
const cities: TermSeed[] = [
  { kind: 'city', slug: 'bengaluru', label: 'Bengaluru', sortOrder: 1 },
  { kind: 'city', slug: 'mumbai', label: 'Mumbai', sortOrder: 2 },
  { kind: 'city', slug: 'pune', label: 'Pune', sortOrder: 3 },
  { kind: 'city', slug: 'hyderabad', label: 'Hyderabad', sortOrder: 4 },
  { kind: 'city', slug: 'chennai', label: 'Chennai', sortOrder: 5 },
  { kind: 'city', slug: 'delhi-ncr', label: 'Delhi NCR', sortOrder: 6 },
  { kind: 'city', slug: 'kolkata', label: 'Kolkata', sortOrder: 7 },
  { kind: 'city', slug: 'ahmedabad', label: 'Ahmedabad', sortOrder: 8 },
];

// ─── LOCALITIES (nested under cities) ──────────────────────────────────────────
const localities: TermSeed[] = [
  // Bengaluru
  { kind: 'locality', slug: 'hsr-layout', label: 'HSR Layout', parentSlug: 'bengaluru', sortOrder: 1 },
  { kind: 'locality', slug: 'whitefield', label: 'Whitefield', parentSlug: 'bengaluru', sortOrder: 2 },
  { kind: 'locality', slug: 'indiranagar', label: 'Indiranagar', parentSlug: 'bengaluru', sortOrder: 3 },
  { kind: 'locality', slug: 'koramangala', label: 'Koramangala', parentSlug: 'bengaluru', sortOrder: 4 },
  { kind: 'locality', slug: 'electronic-city', label: 'Electronic City', parentSlug: 'bengaluru', sortOrder: 5 },
  // Mumbai
  { kind: 'locality', slug: 'andheri', label: 'Andheri', parentSlug: 'mumbai', sortOrder: 1 },
  { kind: 'locality', slug: 'powai', label: 'Powai', parentSlug: 'mumbai', sortOrder: 2 },
  { kind: 'locality', slug: 'bandra', label: 'Bandra', parentSlug: 'mumbai', sortOrder: 3 },
  { kind: 'locality', slug: 'thane', label: 'Thane', parentSlug: 'mumbai', sortOrder: 4 },
  { kind: 'locality', slug: 'navi-mumbai', label: 'Navi Mumbai', parentSlug: 'mumbai', sortOrder: 5 },
  // Pune
  { kind: 'locality', slug: 'hinjewadi', label: 'Hinjewadi', parentSlug: 'pune', sortOrder: 1 },
  { kind: 'locality', slug: 'baner', label: 'Baner', parentSlug: 'pune', sortOrder: 2 },
  { kind: 'locality', slug: 'wakad', label: 'Wakad', parentSlug: 'pune', sortOrder: 3 },
  { kind: 'locality', slug: 'kharadi', label: 'Kharadi', parentSlug: 'pune', sortOrder: 4 },
  { kind: 'locality', slug: 'viman-nagar', label: 'Viman Nagar', parentSlug: 'pune', sortOrder: 5 },
  // Hyderabad
  { kind: 'locality', slug: 'gachibowli', label: 'Gachibowli', parentSlug: 'hyderabad', sortOrder: 1 },
  { kind: 'locality', slug: 'madhapur', label: 'Madhapur', parentSlug: 'hyderabad', sortOrder: 2 },
  { kind: 'locality', slug: 'kondapur', label: 'Kondapur', parentSlug: 'hyderabad', sortOrder: 3 },
  { kind: 'locality', slug: 'jubilee-hills', label: 'Jubilee Hills', parentSlug: 'hyderabad', sortOrder: 4 },
  // Chennai
  { kind: 'locality', slug: 'anna-nagar', label: 'Anna Nagar', parentSlug: 'chennai', sortOrder: 1 },
  { kind: 'locality', slug: 'adyar', label: 'Adyar', parentSlug: 'chennai', sortOrder: 2 },
  { kind: 'locality', slug: 't-nagar', label: 'T. Nagar', parentSlug: 'chennai', sortOrder: 3 },
  { kind: 'locality', slug: 'velachery', label: 'Velachery', parentSlug: 'chennai', sortOrder: 4 },
  // Delhi NCR
  { kind: 'locality', slug: 'gurgaon', label: 'Gurgaon', parentSlug: 'delhi-ncr', sortOrder: 1 },
  { kind: 'locality', slug: 'noida', label: 'Noida', parentSlug: 'delhi-ncr', sortOrder: 2 },
  { kind: 'locality', slug: 'south-delhi', label: 'South Delhi', parentSlug: 'delhi-ncr', sortOrder: 3 },
  { kind: 'locality', slug: 'dwarka', label: 'Dwarka', parentSlug: 'delhi-ncr', sortOrder: 4 },
  { kind: 'locality', slug: 'greater-noida', label: 'Greater Noida', parentSlug: 'delhi-ncr', sortOrder: 5 },
  // Kolkata
  { kind: 'locality', slug: 'salt-lake', label: 'Salt Lake', parentSlug: 'kolkata', sortOrder: 1 },
  { kind: 'locality', slug: 'new-town', label: 'New Town', parentSlug: 'kolkata', sortOrder: 2 },
  { kind: 'locality', slug: 'park-street', label: 'Park Street', parentSlug: 'kolkata', sortOrder: 3 },
  // Ahmedabad
  { kind: 'locality', slug: 'sg-highway', label: 'SG Highway', parentSlug: 'ahmedabad', sortOrder: 1 },
  { kind: 'locality', slug: 'prahlad-nagar', label: 'Prahlad Nagar', parentSlug: 'ahmedabad', sortOrder: 2 },
  { kind: 'locality', slug: 'bodakdev', label: 'Bodakdev', parentSlug: 'ahmedabad', sortOrder: 3 },
];

// ─── PROPERTY TYPES ────────────────────────────────────────────────────────────
const propertyTypes: TermSeed[] = [
  { kind: 'property_type', slug: 'apartment', label: 'Apartment', sortOrder: 1 },
  { kind: 'property_type', slug: 'villa', label: 'Villa', sortOrder: 2 },
  { kind: 'property_type', slug: 'independent-house', label: 'Independent House', sortOrder: 3 },
  { kind: 'property_type', slug: 'duplex', label: 'Duplex', sortOrder: 4 },
  { kind: 'property_type', slug: 'studio', label: 'Studio', sortOrder: 5 },
];

// ─── BHK ───────────────────────────────────────────────────────────────────────
const bhkTypes: TermSeed[] = [
  { kind: 'bhk', slug: '1-bhk', label: '1 BHK', sortOrder: 1 },
  { kind: 'bhk', slug: '2-bhk', label: '2 BHK', sortOrder: 2 },
  { kind: 'bhk', slug: '3-bhk', label: '3 BHK', sortOrder: 3 },
  { kind: 'bhk', slug: '4-bhk', label: '4 BHK', sortOrder: 4 },
  { kind: 'bhk', slug: '4-plus-bhk', label: '4+ BHK', sortOrder: 5 },
];

// ─── ROOMS ─────────────────────────────────────────────────────────────────────
const rooms: TermSeed[] = [
  { kind: 'room', slug: 'living-room', label: 'Living Room', sortOrder: 1 },
  { kind: 'room', slug: 'dining', label: 'Dining', sortOrder: 2 },
  { kind: 'room', slug: 'living-and-dining', label: 'Living & Dining', sortOrder: 3 },
  { kind: 'room', slug: 'modular-kitchen', label: 'Modular Kitchen', sortOrder: 4 },
  { kind: 'room', slug: 'master-bedroom', label: 'Master Bedroom', sortOrder: 5 },
  { kind: 'room', slug: 'guest-bedroom', label: 'Guest Bedroom', sortOrder: 6 },
  { kind: 'room', slug: 'kids-bedroom', label: 'Kids Bedroom', sortOrder: 7 },
  { kind: 'room', slug: 'bathroom', label: 'Bathroom', sortOrder: 8 },
  { kind: 'room', slug: 'powder-room', label: 'Powder Room', sortOrder: 9 },
  { kind: 'room', slug: 'pooja-room', label: 'Pooja Room', sortOrder: 10 },
  { kind: 'room', slug: 'foyer', label: 'Foyer / Entryway', sortOrder: 11 },
  { kind: 'room', slug: 'study', label: 'Study', sortOrder: 12 },
  { kind: 'room', slug: 'home-office', label: 'Home Office', sortOrder: 13 },
  { kind: 'room', slug: 'balcony', label: 'Balcony', sortOrder: 14 },
  { kind: 'room', slug: 'utility', label: 'Utility', sortOrder: 15 },
  { kind: 'room', slug: 'wardrobe-walk-in', label: 'Wardrobe / Walk-in', sortOrder: 16 },
  { kind: 'room', slug: 'home-bar', label: 'Home Bar', sortOrder: 17 },
];

// ─── SCOPES ────────────────────────────────────────────────────────────────────
const scopes: TermSeed[] = [
  { kind: 'scope', slug: 'full-home', label: 'Full Home', sortOrder: 1 },
  { kind: 'scope', slug: 'single-room', label: 'Single Room', sortOrder: 2 },
  { kind: 'scope', slug: 'modular-kitchen', label: 'Modular Kitchen', sortOrder: 3 },
  { kind: 'scope', slug: 'wardrobe', label: 'Wardrobe', sortOrder: 4 },
  { kind: 'scope', slug: 'false-ceiling', label: 'False Ceiling', sortOrder: 5 },
  { kind: 'scope', slug: 'painting-only', label: 'Painting Only', sortOrder: 6 },
  { kind: 'scope', slug: 'renovation', label: 'Renovation', sortOrder: 7 },
  { kind: 'scope', slug: 'new-construction', label: 'New Construction', sortOrder: 8 },
  { kind: 'scope', slug: 'commercial', label: 'Commercial', sortOrder: 9 },
];

// ─── THEMES ────────────────────────────────────────────────────────────────────
const themes: TermSeed[] = [
  { kind: 'theme', slug: 'modern', label: 'Modern', sortOrder: 1 },
  { kind: 'theme', slug: 'contemporary', label: 'Contemporary', sortOrder: 2 },
  { kind: 'theme', slug: 'minimalist', label: 'Minimalist', sortOrder: 3 },
  { kind: 'theme', slug: 'scandinavian', label: 'Scandinavian', sortOrder: 4 },
  { kind: 'theme', slug: 'mid-century-modern', label: 'Mid-Century Modern', sortOrder: 5 },
  { kind: 'theme', slug: 'industrial', label: 'Industrial', sortOrder: 6 },
  { kind: 'theme', slug: 'bohemian', label: 'Bohemian', sortOrder: 7 },
  { kind: 'theme', slug: 'eclectic', label: 'Eclectic', sortOrder: 8 },
  { kind: 'theme', slug: 'transitional', label: 'Transitional', sortOrder: 9 },
  { kind: 'theme', slug: 'traditional', label: 'Traditional', sortOrder: 10 },
  { kind: 'theme', slug: 'rustic', label: 'Rustic', sortOrder: 11 },
  { kind: 'theme', slug: 'art-deco', label: 'Art Deco', sortOrder: 12 },
  { kind: 'theme', slug: 'farmhouse', label: 'Farmhouse', sortOrder: 13 },
  { kind: 'theme', slug: 'indian-traditional', label: 'Indian Traditional', sortOrder: 14 },
  { kind: 'theme', slug: 'indian-contemporary', label: 'Indian Contemporary', sortOrder: 15 },
  { kind: 'theme', slug: 'indian-fusion', label: 'Indian Fusion', sortOrder: 16 },
  { kind: 'theme', slug: 'modern-classical', label: 'Modern Classical', sortOrder: 17 },
];

// ─── BUDGET BANDS ──────────────────────────────────────────────────────────────
// NOTE: INR ranges are industry-standard tiers (Livspace/HomeLane ballpark).
// Exact ranges pending product confirmation — structural correctness unaffected.
const budgetBands: TermSeed[] = [
  { kind: 'budget_band', slug: 'budget', label: 'Budget', sortOrder: 1, metadata: { min: 0, max: 500000 } },
  { kind: 'budget_band', slug: 'moderate', label: 'Moderate', sortOrder: 2, metadata: { min: 500001, max: 1500000 } },
  { kind: 'budget_band', slug: 'upscale', label: 'Upscale', sortOrder: 3, metadata: { min: 1500001, max: 3500000 } },
  { kind: 'budget_band', slug: 'luxury', label: 'Luxury', sortOrder: 4, metadata: { min: 3500001, max: null } },
];

// ─── UPSERT LOGIC ──────────────────────────────────────────────────────────────

/**
 * Upsert a non-locality term by (kind, slug).
 * Updates label, sortOrder, metadata on conflict. Does NOT touch isActive.
 */
async function upsertTerm(term: TermSeed): Promise<string> {
  const [row] = await db
    .insert(schema.taxonomy)
    .values({
      kind: term.kind,
      slug: term.slug,
      label: term.label,
      sortOrder: term.sortOrder ?? 0,
      metadata: term.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [schema.taxonomy.kind, schema.taxonomy.slug],
      targetWhere: sql`${schema.taxonomy.parentId} IS NULL`,
      set: {
        label: term.label,
        sortOrder: term.sortOrder ?? 0,
        metadata: term.metadata ?? {},
        updatedAt: new Date(),
      },
    })
    .returning({ id: schema.taxonomy.id });
  return row!.id;
}

/**
 * Upsert a locality term by (parent_id, slug).
 * Resolves parent by slug. Hard-fails if parent city not found.
 */
async function upsertLocality(term: TermSeed, cityIdMap: Map<string, string>): Promise<void> {
  const parentId = cityIdMap.get(term.parentSlug!);
  if (!parentId) {
    throw new Error(`Seed error: parent city '${term.parentSlug}' not found for locality '${term.slug}'`);
  }

  await db
    .insert(schema.taxonomy)
    .values({
      kind: 'locality',
      slug: term.slug,
      label: term.label,
      parentId,
      sortOrder: term.sortOrder ?? 0,
      metadata: term.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [schema.taxonomy.parentId, schema.taxonomy.slug],
      targetWhere: sql`${schema.taxonomy.parentId} IS NOT NULL`,
      set: {
        label: term.label,
        sortOrder: term.sortOrder ?? 0,
        metadata: term.metadata ?? {},
        updatedAt: new Date(),
      },
    });
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────

export async function seedTaxonomy(): Promise<void> {
  console.log('[seed] Taxonomy: seeding 8 kinds...');

  // 1. Cities first (localities depend on them)
  const cityIdMap = new Map<string, string>();
  for (const city of cities) {
    const id = await upsertTerm(city);
    cityIdMap.set(city.slug, id);
  }
  console.log(`  ✓ ${cities.length} cities`);

  // 2. Localities (require parent city)
  for (const loc of localities) {
    await upsertLocality(loc, cityIdMap);
  }
  console.log(`  ✓ ${localities.length} localities`);

  // 3. Flat vocabularies
  for (const term of propertyTypes) await upsertTerm(term);
  console.log(`  ✓ ${propertyTypes.length} property types`);

  for (const term of bhkTypes) await upsertTerm(term);
  console.log(`  ✓ ${bhkTypes.length} BHK types`);

  for (const term of rooms) await upsertTerm(term);
  console.log(`  ✓ ${rooms.length} rooms`);

  for (const term of scopes) await upsertTerm(term);
  console.log(`  ✓ ${scopes.length} scopes`);

  for (const term of themes) await upsertTerm(term);
  console.log(`  ✓ ${themes.length} themes`);

  for (const term of budgetBands) await upsertTerm(term);
  console.log(`  ✓ ${budgetBands.length} budget bands`);

  const total =
    cities.length + localities.length + propertyTypes.length +
    bhkTypes.length + rooms.length + scopes.length + themes.length + budgetBands.length;
  console.log(`[seed] Taxonomy: ${total} terms seeded successfully.`);
}
