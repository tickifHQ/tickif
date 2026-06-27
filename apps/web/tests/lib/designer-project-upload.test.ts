import { describe, expect, it } from 'vitest';
import {
  buildCreateProjectPayload,
  buildImageMetadata,
  getBackendProjectSelection,
  moveProjectImage,
  shouldRefreshPristineDefaultRooms,
} from '../../src/lib/designer-project-upload';

const propertyTypes = new Set([
  'residential',
  'commercial-workspace',
  'institutional-public',
  'retail-showroom',
  'food-hospitality',
]);

const propertySubtypes = new Set([
  'apartment',
  'villa',
  'corporate-office',
  'creative-studio',
  'showroom',
  'jewellery-store',
  'cafe-coffee-shop',
  'restaurant',
]);

function room(overrides: Partial<Parameters<typeof shouldRefreshPristineDefaultRooms>[0][number]> = {}) {
  return {
    roomSlug: 'modular-kitchen',
    title: 'Kitchen',
    description: '',
    designStyle: '',
    materialFinish: '',
    tags: [],
    tagInput: '',
    images: [],
    uploading: false,
    uploadError: '',
    ...overrides,
  };
}

describe('designer project upload helpers', () => {
  it.each([
    ['apartment', '', 'residential', 'apartment'],
    ['villa', '', 'residential', 'villa'],
    ['office-commercial', '', 'commercial-workspace', 'corporate-office'],
    ['institutional-public', '', 'institutional-public', undefined],
    ['retail-showroom', '', 'retail-showroom', 'showroom'],
    ['cafe-restaurant', '', 'food-hospitality', 'cafe-coffee-shop'],
  ])(
    'maps %s to backend property slugs',
    (projectType, projectSubtype, propertyTypeSlug, propertySubtypeSlug) => {
      expect(
        getBackendProjectSelection({
          projectType,
          projectSubtype,
          availablePropertyTypeSlugs: propertyTypes,
          availablePropertySubtypeSlugs: propertySubtypes,
        }),
      ).toEqual({ propertyTypeSlug, propertySubtypeSlug });
    },
  );

  it.each([
    ['office-commercial', 'creative-studio', 'commercial-workspace', 'creative-studio'],
    ['retail-showroom', 'jewellery-store', 'retail-showroom', 'jewellery-store'],
    ['cafe-restaurant', 'restaurant', 'food-hospitality', 'restaurant'],
  ])(
    'prefers an explicit %s subtype selection over the default',
    (projectType, projectSubtype, propertyTypeSlug, propertySubtypeSlug) => {
      expect(
        getBackendProjectSelection({
          projectType,
          projectSubtype,
          availablePropertyTypeSlugs: propertyTypes,
          availablePropertySubtypeSlugs: propertySubtypes,
        }),
      ).toEqual({ propertyTypeSlug, propertySubtypeSlug });
    },
  );

  it('builds the create-project payload with normalized optional fields', () => {
    const payload = buildCreateProjectPayload({
      projectName: ' Maitri Apartments ',
      selectedProjectTypeLabel: 'Apartment',
      aboutProject: ' Luxury 2BHK ',
      backendProjectSelection: { propertyTypeSlug: 'residential', propertySubtypeSlug: 'apartment' },
      selectedScopeSlug: 'construction',
      primaryField: 'bhk',
      bhkSlug: '2-bhk',
      sizeSqft: '1450',
      citySlug: 'bengaluru',
      localitySlug: 'indiranagar',
      localityLabel: 'Indiranagar',
      buildingName: ' Maitri Apartments ',
      budgetBandSlug: 'luxury',
      completedByMonth: '2026-03',
      projectDuration: '4 months',
      projectType: 'apartment',
      selectedProjectSubtypeLabel: 'Apartment',
      selectedScopes: ['construction'],
    });

    expect(payload).toMatchObject({
      title: 'Maitri Apartments',
      description: 'Luxury 2BHK',
      propertyTypeSlug: 'residential',
      propertySubtypeSlug: 'apartment',
      scopeSlug: 'construction',
      bhkSlug: '2-bhk',
      sizeSqft: 1450,
      citySlug: 'bengaluru',
      localitySlug: 'indiranagar',
      buildingName: 'Maitri Apartments',
      budgetBandSlug: 'luxury',
      completedMonth: '2026-03',
      durationMonths: 4,
      metadata: {
        uiProjectTypeSlug: 'apartment',
        projectSubtypeLabel: 'Apartment',
        projectSubtypeSlug: 'apartment',
        localityLabel: 'Indiranagar',
        scopeSlugs: ['construction'],
      },
    });
  });

  it('builds image metadata with taxonomy slugs and deduplicated tags', () => {
    expect(
      buildImageMetadata({
        roomId: '11111111-1111-4111-8111-111111111111',
        sortOrder: 2,
        designStyle: 'modern',
        materialFinish: 'matte-laminate',
        tags: ['Warm Wood', 'warm wood', '  '],
      }),
    ).toEqual({
      roomId: '11111111-1111-4111-8111-111111111111',
      sortOrder: 2,
      themeSlugs: ['modern'],
      finishSlugs: ['matte-laminate'],
      tagSlugs: ['warm-wood'],
    });
  });

  it('moves project images and rewrites contiguous sort order', () => {
    const images = [
      { id: 'image-1', sortOrder: 0, label: 'A' },
      { id: 'image-2', sortOrder: 1, label: 'B' },
      { id: 'image-3', sortOrder: 2, label: 'C' },
    ];

    expect(moveProjectImage(images, 'image-2', 'previous')).toEqual([
      { id: 'image-2', sortOrder: 0, label: 'B' },
      { id: 'image-1', sortOrder: 1, label: 'A' },
      { id: 'image-3', sortOrder: 2, label: 'C' },
    ]);

    expect(moveProjectImage(images, 'image-2', 'next')).toEqual([
      { id: 'image-1', sortOrder: 0, label: 'A' },
      { id: 'image-3', sortOrder: 1, label: 'C' },
      { id: 'image-2', sortOrder: 2, label: 'B' },
    ]);
  });

  it('keeps image order unchanged for impossible moves', () => {
    const images = [
      { id: 'image-1', sortOrder: 0 },
      { id: 'image-2', sortOrder: 1 },
    ];

    expect(moveProjectImage(images, 'image-1', 'previous')).toBe(images);
    expect(moveProjectImage(images, 'image-2', 'next')).toBe(images);
    expect(moveProjectImage(images, 'missing', 'next')).toBe(images);
  });

  it('does not refresh default rooms after a manual room is added', () => {
    const currentRooms = [
      room({ roomSlug: 'modular-kitchen', title: 'Kitchen' }),
      room({ roomSlug: 'master-bedroom', title: 'Master Bedroom' }),
      room({ roomSlug: 'bathroom', title: 'Bathroom' }),
      room({ roomSlug: 'balcony', title: 'Balcony' }),
    ];
    const nextDefaultRooms = [
      { roomSlug: 'modular-kitchen', title: 'Kitchen' },
      { roomSlug: 'master-bedroom', title: 'Master Bedroom' },
      { roomSlug: 'bathroom', title: 'Bathroom' },
    ];

    expect(shouldRefreshPristineDefaultRooms(currentRooms, nextDefaultRooms)).toBe(false);
  });

  it('refreshes pristine defaults when the project type default room set changes', () => {
    const currentRooms = [
      room({ roomSlug: 'modular-kitchen', title: 'Kitchen' }),
      room({ roomSlug: 'master-bedroom', title: 'Master Bedroom' }),
      room({ roomSlug: 'bathroom', title: 'Bathroom' }),
    ];
    const nextDefaultRooms = [
      { roomSlug: 'cabin', title: 'Cabin 1' },
      { roomSlug: 'workstation-open-seating', title: 'Workstation / Open Seating Area' },
      { roomSlug: 'conference-room', title: 'Conference Room' },
    ];

    expect(shouldRefreshPristineDefaultRooms(currentRooms, nextDefaultRooms)).toBe(true);
  });
});
