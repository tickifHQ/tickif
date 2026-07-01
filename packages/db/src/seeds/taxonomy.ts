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

const residentialRoomDefaults = { defaultRoomSlugs: ['kitchen', 'bedroom', 'bathroom'] };
const villaRoomDefaults = {
  defaultRoomSlugs: ['kitchen', 'bedroom', 'bathroom', 'garden-landscape', 'terrace-rooftop', 'garage-parking'],
};
const workspaceRoomDefaults = { defaultRoomSlugs: ['cabin', 'workstation-open-seating', 'conference-room'] };
const institutionalRoomDefaults = { defaultRoomSlugs: ['lobby-reception', 'guest-room', 'restaurant-dining'] };
const retailRoomDefaults = { defaultRoomSlugs: ['storefront-facade', 'display-area', 'billing-counter'] };
const hospitalityRoomDefaults = { defaultRoomSlugs: ['dining-area', 'kitchen', 'bar-counter'] };

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
  { kind: 'property_type', slug: 'residential', label: 'Residential', sortOrder: 1, metadata: residentialRoomDefaults },
  { kind: 'property_type', slug: 'architecture-construction', label: 'Architecture and construction', sortOrder: 2 },
  { kind: 'property_type', slug: 'commercial-workspace', label: 'Commercial workspace', sortOrder: 3, metadata: workspaceRoomDefaults },
  { kind: 'property_type', slug: 'food-hospitality', label: 'Food and hospitality', sortOrder: 4, metadata: hospitalityRoomDefaults },
  { kind: 'property_type', slug: 'retail-showroom', label: 'Retail and showroom', sortOrder: 5, metadata: retailRoomDefaults },
  { kind: 'property_type', slug: 'institutional-public', label: 'Institutional and public', sortOrder: 6, metadata: institutionalRoomDefaults },
  // Legacy residential terms kept for compatibility with early drafts.
  { kind: 'property_type', slug: 'apartment', label: 'Apartment', sortOrder: 20, metadata: residentialRoomDefaults },
  { kind: 'property_type', slug: 'villa', label: 'Villa', sortOrder: 21, metadata: villaRoomDefaults },
  { kind: 'property_type', slug: 'independent-house', label: 'Independent House', sortOrder: 22, metadata: residentialRoomDefaults },
  { kind: 'property_type', slug: 'duplex', label: 'Duplex', sortOrder: 23, metadata: residentialRoomDefaults },
  { kind: 'property_type', slug: 'studio', label: 'Studio', sortOrder: 24, metadata: residentialRoomDefaults },
];

// ─── PROPERTY SUBTYPES ─────────────────────────────────────────────────────────
const propertySubtypes: TermSeed[] = [
  { kind: 'property_subtype', slug: 'apartment', label: 'Apartment / flat', sortOrder: 1, metadata: { propertyTypeSlug: 'residential', ...residentialRoomDefaults } },
  { kind: 'property_subtype', slug: 'villa', label: 'Villa', sortOrder: 2, metadata: { propertyTypeSlug: 'residential', ...villaRoomDefaults } },
  { kind: 'property_subtype', slug: 'penthouse', label: 'Penthouse', sortOrder: 3, metadata: { propertyTypeSlug: 'residential', ...residentialRoomDefaults } },
  { kind: 'property_subtype', slug: 'row-house-town-house', label: 'Row house / town house', sortOrder: 4, metadata: { propertyTypeSlug: 'residential', ...residentialRoomDefaults } },
  { kind: 'property_subtype', slug: 'studio-apartment', label: 'Studio apartment', sortOrder: 5, metadata: { propertyTypeSlug: 'residential', ...residentialRoomDefaults } },
  { kind: 'property_subtype', slug: 'duplex-triplex', label: 'Duplex / triplex', sortOrder: 6, metadata: { propertyTypeSlug: 'residential', ...residentialRoomDefaults } },
  { kind: 'property_subtype', slug: 'farmhouse', label: 'Farmhouse', sortOrder: 7, metadata: { propertyTypeSlug: 'residential', ...villaRoomDefaults } },
  { kind: 'property_subtype', slug: 'senior-living', label: 'Senior living', sortOrder: 8, metadata: { propertyTypeSlug: 'residential', ...residentialRoomDefaults } },
  { kind: 'property_subtype', slug: 'residential-construction', label: 'Residential construction', sortOrder: 20, metadata: { propertyTypeSlug: 'architecture-construction' } },
  { kind: 'property_subtype', slug: 'commercial-construction', label: 'Commercial construction', sortOrder: 21, metadata: { propertyTypeSlug: 'architecture-construction' } },
  { kind: 'property_subtype', slug: 'facade-exterior', label: 'Facade / exterior', sortOrder: 22, metadata: { propertyTypeSlug: 'architecture-construction' } },
  { kind: 'property_subtype', slug: 'landscape-outdoor', label: 'Landscape / outdoor', sortOrder: 23, metadata: { propertyTypeSlug: 'architecture-construction' } },
  { kind: 'property_subtype', slug: 'renovation-remodel', label: 'Renovation / remodel', sortOrder: 24, metadata: { propertyTypeSlug: 'architecture-construction' } },
  { kind: 'property_subtype', slug: 'mixed-use', label: 'Mixed use', sortOrder: 25, metadata: { propertyTypeSlug: 'architecture-construction' } },
  { kind: 'property_subtype', slug: 'corporate-office', label: 'Corporate office', sortOrder: 40, metadata: { propertyTypeSlug: 'commercial-workspace', ...workspaceRoomDefaults } },
  { kind: 'property_subtype', slug: 'it-tech-office', label: 'IT / Tech office', sortOrder: 41, metadata: { propertyTypeSlug: 'commercial-workspace', ...workspaceRoomDefaults } },
  { kind: 'property_subtype', slug: 'co-working-space', label: 'Co-working space', sortOrder: 42, metadata: { propertyTypeSlug: 'commercial-workspace', ...workspaceRoomDefaults } },
  { kind: 'property_subtype', slug: 'home-office', label: 'Home office', sortOrder: 43, metadata: { propertyTypeSlug: 'commercial-workspace', ...workspaceRoomDefaults } },
  { kind: 'property_subtype', slug: 'creative-studio', label: 'Creative studio', sortOrder: 44, metadata: { propertyTypeSlug: 'commercial-workspace', ...workspaceRoomDefaults } },
  { kind: 'property_subtype', slug: 'bank-finance', label: 'Bank / Finance', sortOrder: 45, metadata: { propertyTypeSlug: 'commercial-workspace', ...workspaceRoomDefaults } },
  { kind: 'property_subtype', slug: 'cafe-coffee-shop', label: 'Cafe / coffee shop', sortOrder: 60, metadata: { propertyTypeSlug: 'food-hospitality', ...hospitalityRoomDefaults } },
  { kind: 'property_subtype', slug: 'restaurant', label: 'Restaurant', sortOrder: 61, metadata: { propertyTypeSlug: 'food-hospitality', ...hospitalityRoomDefaults } },
  { kind: 'property_subtype', slug: 'bar-lounge', label: 'Bar / Lounge', sortOrder: 62, metadata: { propertyTypeSlug: 'food-hospitality', ...hospitalityRoomDefaults } },
  { kind: 'property_subtype', slug: 'hotel-resort', label: 'Hotel / Resort', sortOrder: 63, metadata: { propertyTypeSlug: 'food-hospitality', ...hospitalityRoomDefaults } },
  { kind: 'property_subtype', slug: 'homestay-airbnb', label: 'Homestay / Airbnb', sortOrder: 64, metadata: { propertyTypeSlug: 'food-hospitality', ...hospitalityRoomDefaults } },
  { kind: 'property_subtype', slug: 'bakery-patisserie', label: 'Bakery / Patisserie', sortOrder: 65, metadata: { propertyTypeSlug: 'food-hospitality', ...hospitalityRoomDefaults } },
  { kind: 'property_subtype', slug: 'showroom', label: 'Showroom', sortOrder: 80, metadata: { propertyTypeSlug: 'retail-showroom', ...retailRoomDefaults } },
  { kind: 'property_subtype', slug: 'retail-store', label: 'Retail store', sortOrder: 81, metadata: { propertyTypeSlug: 'retail-showroom', ...retailRoomDefaults } },
  { kind: 'property_subtype', slug: 'jewellery-store', label: 'Jewellery store', sortOrder: 82, metadata: { propertyTypeSlug: 'retail-showroom', ...retailRoomDefaults } },
  { kind: 'property_subtype', slug: 'salon-spa', label: 'Salon / spa', sortOrder: 83, metadata: { propertyTypeSlug: 'retail-showroom', ...retailRoomDefaults } },
  { kind: 'property_subtype', slug: 'pharmacy-clinic-store', label: 'Pharmacy / clinic store', sortOrder: 84, metadata: { propertyTypeSlug: 'retail-showroom', ...retailRoomDefaults } },
  { kind: 'property_subtype', slug: 'pop-up-kiosk', label: 'Pop up / kiosk', sortOrder: 85, metadata: { propertyTypeSlug: 'retail-showroom', ...retailRoomDefaults } },
  { kind: 'property_subtype', slug: 'clinic-hospital', label: 'Clinic / hospital', sortOrder: 100, metadata: { propertyTypeSlug: 'institutional-public', ...institutionalRoomDefaults } },
  { kind: 'property_subtype', slug: 'school-college', label: 'School / college', sortOrder: 101, metadata: { propertyTypeSlug: 'institutional-public', ...institutionalRoomDefaults } },
  { kind: 'property_subtype', slug: 'gym-fitness-center', label: 'Gym / Fitness center', sortOrder: 102, metadata: { propertyTypeSlug: 'institutional-public', ...institutionalRoomDefaults } },
  { kind: 'property_subtype', slug: 'religious-spiritual', label: 'Religious / spiritual', sortOrder: 103, metadata: { propertyTypeSlug: 'institutional-public', ...institutionalRoomDefaults } },
  { kind: 'property_subtype', slug: 'event-banquet-hall', label: 'Event / Banquet hall', sortOrder: 104, metadata: { propertyTypeSlug: 'institutional-public', ...institutionalRoomDefaults } },
  { kind: 'property_subtype', slug: 'childcare-playschool', label: 'Childcare / playschool', sortOrder: 105, metadata: { propertyTypeSlug: 'institutional-public', ...institutionalRoomDefaults } },
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
  { kind: 'room', slug: 'kitchen', label: 'Kitchen', sortOrder: 18 },
  { kind: 'room', slug: 'bedroom', label: 'Bedroom', sortOrder: 19 },
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
  { kind: 'room', slug: 'garden-landscape', label: 'Garden / Landscape', sortOrder: 30 },
  { kind: 'room', slug: 'terrace-rooftop', label: 'Terrace / Rooftop', sortOrder: 31 },
  { kind: 'room', slug: 'garage-parking', label: 'Garage / Parking', sortOrder: 32 },
  { kind: 'room', slug: 'staff-quarters', label: 'Staff Quarters', sortOrder: 33 },
  { kind: 'room', slug: 'cabin', label: 'Cabin', sortOrder: 50 },
  { kind: 'room', slug: 'workstation-open-seating', label: 'Workstation / Open Seating Area', sortOrder: 51 },
  { kind: 'room', slug: 'conference-room', label: 'Conference Room', sortOrder: 52 },
  { kind: 'room', slug: 'cafeteria-pantry', label: 'Cafeteria / Pantry', sortOrder: 53 },
  { kind: 'room', slug: 'breakout-lounge', label: 'Breakout / Lounge Area', sortOrder: 54 },
  { kind: 'room', slug: 'server-room', label: 'Server Room', sortOrder: 55 },
  { kind: 'room', slug: 'lobby-reception', label: 'Lobby / Reception', sortOrder: 70 },
  { kind: 'room', slug: 'guest-room', label: 'Guest Room', sortOrder: 71 },
  { kind: 'room', slug: 'restaurant-dining', label: 'Restaurant / Dining', sortOrder: 72 },
  { kind: 'room', slug: 'spa-wellness', label: 'Spa / Wellness', sortOrder: 73 },
  { kind: 'room', slug: 'banquet-event-space', label: 'Banquet / Event Space', sortOrder: 74 },
  { kind: 'room', slug: 'storefront-facade', label: 'Storefront / Facade', sortOrder: 90 },
  { kind: 'room', slug: 'display-area', label: 'Display Area', sortOrder: 91 },
  { kind: 'room', slug: 'billing-counter', label: 'Billing Counter', sortOrder: 92 },
  { kind: 'room', slug: 'trial-room', label: 'Trial Room', sortOrder: 93 },
  { kind: 'room', slug: 'storage-back-room', label: 'Storage / Back Room', sortOrder: 94 },
  { kind: 'room', slug: 'customer-lounge', label: 'Customer Lounge', sortOrder: 95 },
  { kind: 'room', slug: 'dining-area', label: 'Dining Area', sortOrder: 110 },
  { kind: 'room', slug: 'bar-counter', label: 'Bar Counter', sortOrder: 111 },
  { kind: 'room', slug: 'outdoor-seating', label: 'Outdoor Seating', sortOrder: 112 },
  { kind: 'room', slug: 'private-dining-room', label: 'Private Dining Room', sortOrder: 113 },
  { kind: 'room', slug: 'billing-takeaway-counter', label: 'Billing / Takeaway Counter', sortOrder: 114 },
  { kind: 'room', slug: 'packing-station', label: 'Packing Station', sortOrder: 115 },
];

// ─── SCOPES ────────────────────────────────────────────────────────────────────
const scopes: TermSeed[] = [
  { kind: 'scope', slug: 'design', label: 'Design', sortOrder: 1 },
  { kind: 'scope', slug: 'interior-execution', label: 'Interior execution', sortOrder: 2 },
  { kind: 'scope', slug: 'construction', label: 'Construction', sortOrder: 3 },
  { kind: 'scope', slug: 'full-home', label: 'Full Home', sortOrder: 10 },
  { kind: 'scope', slug: 'single-room', label: 'Single Room', sortOrder: 11 },
  { kind: 'scope', slug: 'modular-kitchen', label: 'Modular Kitchen', sortOrder: 12 },
  { kind: 'scope', slug: 'wardrobe', label: 'Wardrobe', sortOrder: 13 },
  { kind: 'scope', slug: 'false-ceiling', label: 'False Ceiling', sortOrder: 14 },
  { kind: 'scope', slug: 'painting-only', label: 'Painting Only', sortOrder: 15 },
  { kind: 'scope', slug: 'renovation', label: 'Renovation', sortOrder: 16 },
  { kind: 'scope', slug: 'new-construction', label: 'New Construction', sortOrder: 17 },
  { kind: 'scope', slug: 'commercial', label: 'Commercial', sortOrder: 18 },
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
  { kind: 'budget_band', slug: 'budget', label: 'Under ₹5L', sortOrder: 1, metadata: { min: 0, max: 500000 } },
  { kind: 'budget_band', slug: 'moderate', label: '₹5L - ₹15L', sortOrder: 2, metadata: { min: 500001, max: 1500000 } },
  { kind: 'budget_band', slug: 'upscale', label: '₹15L - ₹35L', sortOrder: 3, metadata: { min: 1500001, max: 3500000 } },
  { kind: 'budget_band', slug: 'luxury', label: '₹35L+', sortOrder: 4, metadata: { min: 3500001, max: null } },
];

// ─── E-124: PER-ROOM ATTRIBUTE VOCABULARIES ────────────────────────────────────

// --- MATERIALS (surface-scoped: cabinet, countertop, wall/floor) ---
const materials: TermSeed[] = [
  { kind: 'material', slug: 'plywood-bwp', label: 'Plywood (BWP/Marine)', sortOrder: 1 },
  { kind: 'material', slug: 'plywood-bwr', label: 'Plywood (BWR)', sortOrder: 2 },
  { kind: 'material', slug: 'mdf', label: 'MDF', sortOrder: 3 },
  { kind: 'material', slug: 'hdhmr', label: 'HDHMR', sortOrder: 4 },
  { kind: 'material', slug: 'particleboard', label: 'Particleboard', sortOrder: 5 },
  { kind: 'material', slug: 'acrylic', label: 'Acrylic', sortOrder: 6 },
  { kind: 'material', slug: 'laminate', label: 'Laminate', sortOrder: 7 },
  { kind: 'material', slug: 'veneer', label: 'Veneer', sortOrder: 8 },
  { kind: 'material', slug: 'solid-wood', label: 'Solid Wood', sortOrder: 9 },
  { kind: 'material', slug: 'pvc', label: 'PVC', sortOrder: 10 },
  { kind: 'material', slug: 'quartz', label: 'Quartz', sortOrder: 11 },
  { kind: 'material', slug: 'granite', label: 'Granite', sortOrder: 12 },
  { kind: 'material', slug: 'marble', label: 'Marble', sortOrder: 13 },
];

// --- FINISHES ---
const finishes: TermSeed[] = [
  { kind: 'finish', slug: 'laminate', label: 'Laminate', sortOrder: 1 },
  { kind: 'finish', slug: 'acrylic-gloss', label: 'Acrylic (Gloss)', sortOrder: 2 },
  { kind: 'finish', slug: 'acrylic-matte', label: 'Acrylic (Matte)', sortOrder: 3 },
  { kind: 'finish', slug: 'pu', label: 'PU (Polyurethane)', sortOrder: 4 },
  { kind: 'finish', slug: 'membrane', label: 'Membrane', sortOrder: 5 },
  { kind: 'finish', slug: 'veneer', label: 'Veneer', sortOrder: 6 },
  { kind: 'finish', slug: 'glass', label: 'Glass', sortOrder: 7 },
  { kind: 'finish', slug: 'fabric', label: 'Fabric', sortOrder: 8 },
];

// --- LAYOUTS (per-room) ---
const layouts: TermSeed[] = [
  // Kitchen layouts
  { kind: 'layout', slug: 'straight', label: 'Straight', sortOrder: 1, metadata: { room: 'kitchen' } },
  { kind: 'layout', slug: 'l-shaped', label: 'L-Shaped', sortOrder: 2, metadata: { room: 'kitchen' } },
  { kind: 'layout', slug: 'u-shaped', label: 'U-Shaped', sortOrder: 3, metadata: { room: 'kitchen' } },
  { kind: 'layout', slug: 'parallel', label: 'Parallel / Galley', sortOrder: 4, metadata: { room: 'kitchen' } },
  { kind: 'layout', slug: 'island', label: 'Island', sortOrder: 5, metadata: { room: 'kitchen' } },
  { kind: 'layout', slug: 'g-shaped', label: 'G-Shaped', sortOrder: 6, metadata: { room: 'kitchen' } },
  // Wardrobe layouts
  { kind: 'layout', slug: 'sliding', label: 'Sliding', sortOrder: 7, metadata: { room: 'wardrobe' } },
  { kind: 'layout', slug: 'hinged', label: 'Hinged', sortOrder: 8, metadata: { room: 'wardrobe' } },
  { kind: 'layout', slug: 'walk-in', label: 'Walk-in', sortOrder: 9, metadata: { room: 'wardrobe' } },
  { kind: 'layout', slug: 'corner-l', label: 'Corner / L-Shaped', sortOrder: 10, metadata: { room: 'wardrobe' } },
  { kind: 'layout', slug: 'loft', label: 'Loft', sortOrder: 11, metadata: { room: 'wardrobe' } },
];

// --- PALETTES (color groupings) ---
const palettes: TermSeed[] = [
  { kind: 'palette', slug: 'blues', label: 'Blues', sortOrder: 1 },
  { kind: 'palette', slug: 'greens', label: 'Greens', sortOrder: 2 },
  { kind: 'palette', slug: 'greys', label: 'Greys', sortOrder: 3 },
  { kind: 'palette', slug: 'neutrals', label: 'Neutrals', sortOrder: 4 },
  { kind: 'palette', slug: 'warm-tones', label: 'Warm Tones', sortOrder: 5 },
  { kind: 'palette', slug: 'wood-tones', label: 'Wood Tones', sortOrder: 6 },
];

// --- SIZE BANDS ---
const sizeBands: TermSeed[] = [
  { kind: 'size_band', slug: 'compact', label: 'Compact', sortOrder: 1 },
  { kind: 'size_band', slug: 'medium', label: 'Medium', sortOrder: 2 },
  { kind: 'size_band', slug: 'large', label: 'Large', sortOrder: 3 },
  { kind: 'size_band', slug: 'expansive', label: 'Expansive', sortOrder: 4 },
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
  console.log('[seed] Taxonomy: seeding 14 kinds...');

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

  for (const term of propertySubtypes) await upsertTerm(term);
  console.log(`  ✓ ${propertySubtypes.length} property subtypes`);

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

  // 4. E-124: Per-room attribute vocabularies
  for (const term of materials) await upsertTerm(term);
  console.log(`  ✓ ${materials.length} materials`);

  for (const term of finishes) await upsertTerm(term);
  console.log(`  ✓ ${finishes.length} finishes`);

  for (const term of layouts) await upsertTerm(term);
  console.log(`  ✓ ${layouts.length} layouts`);

  for (const term of palettes) await upsertTerm(term);
  console.log(`  ✓ ${palettes.length} palettes`);

  for (const term of sizeBands) await upsertTerm(term);
  console.log(`  ✓ ${sizeBands.length} size bands`);

  const total =
    cities.length + localities.length + propertyTypes.length +
    propertySubtypes.length + bhkTypes.length + rooms.length + scopes.length + themes.length + budgetBands.length +
    materials.length + finishes.length + layouts.length + palettes.length + sizeBands.length;
  console.log(`[seed] Taxonomy: ${total} terms seeded successfully.`);
}
