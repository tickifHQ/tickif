/**
 * Demo seed data matrix (E-demo): 2 designers × 2 published projects × 4 images.
 *
 * Every id is a HARDCODED constant so re-runs are deterministic: entities upsert
 * by primary/natural key, media queue jobIds (`media-<imageId>`) collapse
 * re-deliveries, and derivative R2 keys (keyed on projectId+imageId) overwrite
 * rather than orphan. Taxonomy slugs must exist in packages/db/src/seeds/taxonomy.ts.
 */

export type SeedImageSpec = {
  /** Fixed projectImage uuid. */
  id: string;
  /** Fixture filename under apps/api/fixtures/seed-demo/ (downloaded + cached on first run). */
  file: string;
  /** images.unsplash.com photo id the fixture is downloaded from (see fixtures README). */
  unsplashId: string;
  /** Room (kind 'room' taxonomy slug) this image belongs to. */
  roomSlug: string;
  themeSlugs: string[];
  materialSlugs: string[];
  finishSlugs: string[];
  sortOrder: number;
};

export type SeedProjectSpec = {
  /** Fixed project uuid. */
  id: string;
  title: string;
  slug: string;
  description: string;
  citySlug: string;
  localitySlug: string;
  propertyTypeSlug: string;
  propertySubtypeSlug: string;
  bhkSlug: string | null;
  scopeSlug: string;
  budgetBandSlug: string;
  sizeSqft: number;
  /** YYYY-MM */
  completedMonth: string;
  durationMonths: number;
  /** Rooms to create, in display order. Every image roomSlug must appear here. */
  roomSlugs: string[];
  /** First image becomes the project cover. */
  images: SeedImageSpec[];
};

export type SeedFootprintSpec = {
  kind: 'city' | 'scope' | 'theme';
  slug: string;
};

export type SeedDesignerSpec = {
  /** Fixed better-auth user id (text). */
  userId: string;
  /** Fixed organization id (text). */
  orgId: string;
  /** Fixed member id (text). */
  memberId: string;
  orgName: string;
  orgSlug: string;
  /** User display name + dev-OTP login phone. */
  name: string;
  phone: string;
  email: string;
  displayName: string;
  entityType: 'individual' | 'company';
  bio: string;
  yearsExperience: number;
  foundedYear?: number;
  staffCount?: number;
  instagramHandle?: string;
  footprint: SeedFootprintSpec[];
  projects: SeedProjectSpec[];
};

export const SEED_DESIGNERS: SeedDesignerSpec[] = [
  {
    userId: 'seed-user-priya-nair',
    orgId: 'seed-org-studio-meraki',
    memberId: 'seed-member-studio-meraki',
    orgName: 'Studio Meraki',
    orgSlug: 'studio-meraki',
    name: 'Priya Nair',
    phone: '+919800000101',
    email: '+919800000101@phone.tickif.local',
    displayName: 'Studio Meraki',
    entityType: 'company',
    bio: 'Bengaluru-based interior design studio crafting warm, functional homes. Full-home interiors and modular kitchens with a modern, livable aesthetic.',
    yearsExperience: 8,
    foundedYear: 2017,
    staffCount: 12,
    instagramHandle: 'studiomeraki.blr',
    footprint: [
      { kind: 'city', slug: 'bengaluru' },
      { kind: 'scope', slug: 'full-home' },
      { kind: 'scope', slug: 'modular-kitchen' },
      { kind: 'theme', slug: 'modern' },
      { kind: 'theme', slug: 'scandinavian' },
    ],
    projects: [
      {
        id: 'e5eed001-0000-4000-8000-000000000001',
        title: 'Modern 3 BHK in HSR Layout',
        slug: 'modern-3-bhk-hsr-layout-demo',
        description:
          'A warm modern full-home makeover for a young family: muted walls, accent furniture, a handle-less modular kitchen in quartz and acrylic, and a veneer-wrapped master suite.',
        citySlug: 'bengaluru',
        localitySlug: 'hsr-layout',
        propertyTypeSlug: 'residential',
        propertySubtypeSlug: 'apartment',
        bhkSlug: '3-bhk',
        scopeSlug: 'full-home',
        budgetBandSlug: 'upscale',
        sizeSqft: 1650,
        completedMonth: '2025-11',
        durationMonths: 4,
        roomSlugs: ['living-room', 'modular-kitchen', 'master-bedroom', 'dining'],
        images: [
          {
            id: 'e5eed1a6-0000-4000-8000-000000000101',
            file: 'd1-p1-01-living-room.jpg',
            unsplashId: '1586023492125-27b2c045efd7',
            roomSlug: 'living-room',
            themeSlugs: ['modern'],
            materialSlugs: ['veneer', 'solid-wood'],
            finishSlugs: ['veneer', 'pu'],
            sortOrder: 0,
          },
          {
            id: 'e5eed1a6-0000-4000-8000-000000000102',
            file: 'd1-p1-02-modular-kitchen.jpg',
            unsplashId: '1556911220-bff31c812dba',
            roomSlug: 'modular-kitchen',
            themeSlugs: ['modern'],
            materialSlugs: ['plywood-bwp', 'quartz'],
            finishSlugs: ['acrylic-gloss'],
            sortOrder: 1,
          },
          {
            id: 'e5eed1a6-0000-4000-8000-000000000103',
            file: 'd1-p1-03-master-bedroom.jpg',
            unsplashId: '1616594039964-ae9021a400a0',
            roomSlug: 'master-bedroom',
            themeSlugs: ['modern'],
            materialSlugs: ['mdf', 'laminate'],
            finishSlugs: ['laminate', 'fabric'],
            sortOrder: 2,
          },
          {
            id: 'e5eed1a6-0000-4000-8000-000000000104',
            file: 'd1-p1-04-dining.jpg',
            unsplashId: '1617806118233-18e1de247200',
            roomSlug: 'dining',
            themeSlugs: ['modern'],
            materialSlugs: ['solid-wood'],
            finishSlugs: ['pu', 'fabric'],
            sortOrder: 3,
          },
        ],
      },
      {
        id: 'e5eed001-0000-4000-8000-000000000002',
        title: 'Scandinavian 2 BHK in Whitefield',
        slug: 'scandinavian-2-bhk-whitefield-demo',
        description:
          'Light woods, airy whites and soft greys for a compact 2 BHK. Membrane-finish wardrobes, a laminate kitchen and a quiet study nook that doubles as a reading corner.',
        citySlug: 'bengaluru',
        localitySlug: 'whitefield',
        propertyTypeSlug: 'residential',
        propertySubtypeSlug: 'apartment',
        bhkSlug: '2-bhk',
        scopeSlug: 'full-home',
        budgetBandSlug: 'moderate',
        sizeSqft: 1150,
        completedMonth: '2025-08',
        durationMonths: 3,
        roomSlugs: ['living-room', 'bedroom', 'kitchen', 'study'],
        images: [
          {
            id: 'e5eed1a6-0000-4000-8000-000000000201',
            file: 'd1-p2-01-living-room.jpg',
            unsplashId: '1583847268964-b28dc8f51f92',
            roomSlug: 'living-room',
            themeSlugs: ['scandinavian'],
            materialSlugs: ['solid-wood', 'laminate'],
            finishSlugs: ['fabric', 'laminate'],
            sortOrder: 0,
          },
          {
            id: 'e5eed1a6-0000-4000-8000-000000000202',
            file: 'd1-p2-02-bedroom.jpg',
            unsplashId: '1595526114035-0d45ed16cfbf',
            roomSlug: 'bedroom',
            themeSlugs: ['scandinavian'],
            materialSlugs: ['mdf', 'particleboard'],
            finishSlugs: ['membrane', 'fabric'],
            sortOrder: 1,
          },
          {
            id: 'e5eed1a6-0000-4000-8000-000000000203',
            file: 'd1-p2-03-kitchen.jpg',
            unsplashId: '1600489000022-c2086d79f9d4',
            roomSlug: 'kitchen',
            themeSlugs: ['scandinavian'],
            materialSlugs: ['plywood-bwr', 'laminate'],
            finishSlugs: ['laminate'],
            sortOrder: 2,
          },
          {
            id: 'e5eed1a6-0000-4000-8000-000000000204',
            file: 'd1-p2-04-study.jpg',
            unsplashId: '1486946255434-2466348c2166',
            roomSlug: 'study',
            themeSlugs: ['scandinavian'],
            materialSlugs: ['mdf', 'laminate'],
            finishSlugs: ['laminate', 'fabric'],
            sortOrder: 3,
          },
        ],
      },
    ],
  },
  {
    userId: 'seed-user-arjun-mehta',
    orgId: 'seed-org-atelier-arjun',
    memberId: 'seed-member-atelier-arjun',
    orgName: 'Atelier Arjun',
    orgSlug: 'atelier-arjun',
    name: 'Arjun Mehta',
    phone: '+919800000102',
    email: '+919800000102@phone.tickif.local',
    displayName: 'Atelier Arjun',
    entityType: 'individual',
    bio: 'Independent designer working across Mumbai homes and hospitality spaces. Contemporary residences and characterful commercial interiors, from concept to styling.',
    yearsExperience: 12,
    instagramHandle: 'atelier.arjun',
    footprint: [
      { kind: 'city', slug: 'mumbai' },
      { kind: 'scope', slug: 'design' },
      { kind: 'scope', slug: 'commercial' },
      { kind: 'theme', slug: 'contemporary' },
      { kind: 'theme', slug: 'industrial' },
    ],
    projects: [
      {
        id: 'e5eed001-0000-4000-8000-000000000003',
        title: 'Contemporary 4 BHK Villa in Powai',
        slug: 'contemporary-villa-powai-demo',
        description:
          'Design consultancy for a lakeside villa: an open living-and-dining core in marble and veneer, serene bedrooms, and a landscaped garden that pulls the outdoors in.',
        citySlug: 'mumbai',
        localitySlug: 'powai',
        propertyTypeSlug: 'residential',
        propertySubtypeSlug: 'villa',
        bhkSlug: '4-bhk',
        scopeSlug: 'design',
        budgetBandSlug: 'luxury',
        sizeSqft: 3200,
        completedMonth: '2025-12',
        durationMonths: 8,
        roomSlugs: ['living-and-dining', 'master-bedroom', 'guest-bedroom', 'garden-landscape'],
        images: [
          {
            id: 'e5eed1a6-0000-4000-8000-000000000301',
            file: 'd2-p3-01-living-and-dining.jpg',
            unsplashId: '1600607687939-ce8a6c25118c',
            roomSlug: 'living-and-dining',
            themeSlugs: ['contemporary'],
            materialSlugs: ['marble', 'veneer', 'solid-wood'],
            finishSlugs: ['pu', 'veneer'],
            sortOrder: 0,
          },
          {
            id: 'e5eed1a6-0000-4000-8000-000000000302',
            file: 'd2-p3-02-master-bedroom.jpg',
            unsplashId: '1505693416388-ac5ce068fe85',
            roomSlug: 'master-bedroom',
            themeSlugs: ['contemporary'],
            materialSlugs: ['veneer', 'solid-wood'],
            finishSlugs: ['fabric', 'pu'],
            sortOrder: 1,
          },
          {
            id: 'e5eed1a6-0000-4000-8000-000000000303',
            file: 'd2-p3-03-guest-bedroom.jpg',
            unsplashId: '1522771739844-6a9f6d5f14af',
            roomSlug: 'guest-bedroom',
            themeSlugs: ['contemporary'],
            materialSlugs: ['mdf', 'laminate'],
            finishSlugs: ['fabric', 'laminate'],
            sortOrder: 2,
          },
          {
            id: 'e5eed1a6-0000-4000-8000-000000000304',
            file: 'd2-p3-04-garden-landscape.jpg',
            unsplashId: '1600585154340-be6161a56a0c',
            roomSlug: 'garden-landscape',
            themeSlugs: ['contemporary'],
            materialSlugs: ['granite', 'solid-wood'],
            finishSlugs: ['glass', 'pu'],
            sortOrder: 3,
          },
        ],
      },
      {
        id: 'e5eed001-0000-4000-8000-000000000004',
        title: 'Industrial Café in Bandra',
        slug: 'industrial-cafe-bandra-demo',
        description:
          'A 900 sqft espresso bar with exposed services, reclaimed wood tables and a granite brew counter. Compact takeaway flow with an all-day dining room and street-side seating.',
        citySlug: 'mumbai',
        localitySlug: 'bandra',
        propertyTypeSlug: 'food-hospitality',
        propertySubtypeSlug: 'cafe-coffee-shop',
        bhkSlug: null,
        scopeSlug: 'commercial',
        budgetBandSlug: 'upscale',
        sizeSqft: 900,
        completedMonth: '2026-02',
        durationMonths: 3,
        roomSlugs: ['dining-area', 'bar-counter', 'outdoor-seating', 'billing-takeaway-counter'],
        images: [
          {
            id: 'e5eed1a6-0000-4000-8000-000000000401',
            file: 'd2-p4-01-dining-area.jpg',
            unsplashId: '1554118811-1e0d58224f24',
            roomSlug: 'dining-area',
            themeSlugs: ['industrial'],
            materialSlugs: ['solid-wood', 'pvc'],
            finishSlugs: ['pu'],
            sortOrder: 0,
          },
          {
            id: 'e5eed1a6-0000-4000-8000-000000000402',
            file: 'd2-p4-02-bar-counter.jpg',
            unsplashId: '1521017432531-fbd92d768814',
            roomSlug: 'bar-counter',
            themeSlugs: ['industrial'],
            materialSlugs: ['solid-wood', 'granite'],
            finishSlugs: ['pu', 'glass'],
            sortOrder: 1,
          },
          {
            id: 'e5eed1a6-0000-4000-8000-000000000403',
            file: 'd2-p4-03-outdoor-seating.jpg',
            unsplashId: '1445116572660-236099ec97a0',
            roomSlug: 'outdoor-seating',
            themeSlugs: ['industrial'],
            materialSlugs: ['solid-wood'],
            finishSlugs: ['glass'],
            sortOrder: 2,
          },
          {
            id: 'e5eed1a6-0000-4000-8000-000000000404',
            file: 'd2-p4-04-billing-counter.jpg',
            unsplashId: '1453614512568-c4024d13c247',
            roomSlug: 'billing-takeaway-counter',
            themeSlugs: ['industrial'],
            materialSlugs: ['solid-wood', 'granite'],
            finishSlugs: ['pu'],
            sortOrder: 3,
          },
        ],
      },
    ],
  },
];
