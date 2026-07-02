'use client';

import type { ChangeEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronsUpDown,
  CircleDashed,
  Clock3,
  ImagePlus,
  Info,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  allowedImageContentType,
  listProjectImagesResponseSchema,
  listTaxonomyResponseSchema,
  projectCompletenessResponseSchema,
  projectDetailResponseSchema,
  projectImageAttachmentSchema,
  projectImageSchema,
  projectRoomSchema,
  uploadUrlResponseSchema,
  type AllowedImageContentType,
  type CreateProjectRoomInput,
  type ProjectCompletenessResponse,
  type ProjectDetailResponse,
  type ProjectImageDto,
  type ProjectRoom,
  type TaxonomyTerm,
  type UpdateProjectInput,
  type UpdateProjectRoomInput,
} from '@repo/contracts';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { Card, CardContent } from '@repo/ui/components/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@repo/ui/components/dialog';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { Textarea } from '@repo/ui/components/textarea';
import { cn } from '@repo/ui/lib/utils';
import { api } from '@/lib/api';
import {
  buildCreateProjectPayload as buildCreateProjectPayloadInput,
  buildImageMetadata as buildImageMetadataInput,
  getBackendProjectSelection,
  moveProjectImage,
  roomSlugCandidates,
  roomSlugsMatch,
  shouldRefreshPristineDefaultRooms,
  type BackendProjectSelection,
  type ProjectImageMoveDirection,
} from '@/lib/designer-project-upload';

type ProjectTypeOption = {
  slug: string;
  label: string;
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
};

type ProjectSubtypeOption = {
  slug: string;
  label: string;
};

type BackendProjectSelectionState =
  | { selection: BackendProjectSelection; error: '' }
  | { selection: null; error: string };

type RoomTemplate = {
  slug: string;
  title: string;
  allowMultiple?: boolean;
  numberedPrefix?: string;
  alwaysNumber?: boolean;
};

type ProjectTypeBehavior = {
  detailsTitle: string;
  detailsSubtitle: string;
  primaryField: 'bhk' | 'subtype';
  primaryLabel: string;
  primaryPlaceholder: string;
  subtypeOptions?: ProjectSubtypeOption[];
  buildingNameLabel?: string;
  defaultRooms: (bhkSlug: string) => RoomTemplate[];
  suggestedRooms: (bhkSlug: string) => RoomTemplate[];
};

type RoomDraft = {
  clientId: string;
  id?: string;
  roomSlug: string;
  roomTypeId?: string;
  title: string;
  description: string;
  expanded: boolean;
  designStyle: string;
  materialFinish: string;
  tags: string[];
  tagInput: string;
  images: ProjectImagePreview[];
  uploading: boolean;
  uploadError: string;
};

type ProjectImagePreview = Pick<ProjectImageDto, 'id' | 'status' | 'sortOrder' | 'width' | 'height'> & {
  fileName: string;
  previewUrl?: string;
};

type SectionId = 'classification' | 'timeline' | 'metadata' | 'images';

const typography = {
  pageTitle: 'text-2xl leading-[1.25] font-medium tracking-[-0.0096em]',
  pageSubtitle: 'text-sm leading-[1.6] font-normal',
  stepLabel: 'font-mono text-xs leading-4 font-medium tracking-[-0.02em] uppercase',
  sectionTitle: 'text-lg leading-[1.6] font-medium tracking-normal',
  subsectionTitle: 'text-base leading-[1.1] font-medium tracking-normal',
  label: 'text-[13px] leading-[1.6] font-medium',
  control: 'text-[13px] leading-[1.1]',
  bodySmall: 'text-xs leading-[1.6] font-normal',
  bodyMedium: 'text-xs leading-[1.6] font-medium',
  navText: 'text-[13px] leading-[1.1] font-medium',
  monoEyebrow: 'font-mono text-xs leading-4 font-medium tracking-[-0.02em] uppercase',
};

const projectTypeVisuals: Record<string, Omit<ProjectTypeOption, 'slug' | 'label'>> = {
  apartment: {
    imageSrc: '/illustrations/project-upload/project-type-apartment.svg',
    imageWidth: 58,
    imageHeight: 51,
  },
  villa: {
    imageSrc: '/illustrations/project-upload/project-type-villa.svg',
    imageWidth: 88,
    imageHeight: 51,
  },
  'office-commercial': {
    imageSrc: '/illustrations/project-upload/project-type-commercial.svg',
    imageWidth: 68,
    imageHeight: 51,
  },
  'institutional-public': {
    imageSrc: '/illustrations/project-upload/project-type-public.svg',
    imageWidth: 60,
    imageHeight: 51,
  },
  'retail-showroom': {
    imageSrc: '/illustrations/project-upload/project-type-retail.svg',
    imageWidth: 68,
    imageHeight: 51,
  },
  'cafe-restaurant': {
    imageSrc: '/illustrations/project-upload/project-type-cafe.svg',
    imageWidth: 72,
    imageHeight: 51,
  },
};

const supportedProjectTypeSlugs = Object.keys(projectTypeVisuals);
const fallbackProjectTypeLabels: Record<string, string> = {
  apartment: 'Apartment',
  villa: 'Villa',
  'office-commercial': 'Office / Commercial',
  'institutional-public': 'Institutional / Public',
  'retail-showroom': 'Retail / Showroom',
  'cafe-restaurant': 'Cafe / Restaurant',
};
const projectDeliveryScopeSlugs = ['design', 'interior-execution', 'construction'];

const fallbackDurationOptions = ['1 month', '2 months', '3 months', '4 months', '6 months', '9 months', '12+ months'];

const commercialTypeOptions: ProjectSubtypeOption[] = [
  { slug: 'corporate-office', label: 'Corporate office' },
  { slug: 'it-tech-office', label: 'IT/Tech office' },
  { slug: 'co-working-space', label: 'Co-working space' },
  { slug: 'home-office', label: 'Home office' },
  { slug: 'creative-studio', label: 'Creative studio' },
  { slug: 'bank-finance', label: 'Bank/Finance' },
];

const institutionalTypeOptions: ProjectSubtypeOption[] = [
  { slug: 'clinic-hospital', label: 'Clinic/hospital' },
  { slug: 'school-college', label: 'School/college' },
  { slug: 'gym-fitness-center', label: 'Gym/Fitness center' },
  { slug: 'religious-spiritual', label: 'Religious/spiritual' },
  { slug: 'event-banquet-hall', label: 'Event/Banquet hall' },
  { slug: 'childcare-playschool', label: 'Childcare/playschool' },
];

const showroomTypeOptions: ProjectSubtypeOption[] = [
  { slug: 'showroom', label: 'Showroom' },
  { slug: 'retail-store', label: 'Retail store' },
  { slug: 'jewellery-store', label: 'Jewellery store' },
  { slug: 'salon-spa', label: 'Salon/spa' },
  { slug: 'pharmacy-clinic-store', label: 'Pharmacy/clinic store' },
  { slug: 'pop-up-kiosk', label: 'Pop up/kiosk' },
];

const restaurantTypeOptions: ProjectSubtypeOption[] = [
  { slug: 'cafe-coffee-shop', label: 'Cafe/coffee shop' },
  { slug: 'restaurant', label: 'Restaurant' },
  { slug: 'bar-lounge', label: 'Bar/Lounge' },
  { slug: 'hotel-resort', label: 'Hotel/Resort' },
  { slug: 'homestay-airbnb', label: 'Homestay/Airbnb' },
  { slug: 'bakery-patisserie', label: 'Bakery/Patisserie' },
];

function bedroomTemplatesForBhk(bhkSlug: string) {
  switch (bhkSlug) {
    case '1-bhk':
      return [{ slug: 'master-bedroom', title: 'Master Bedroom' }];
    case '2-bhk':
      return [
        { slug: 'master-bedroom', title: 'Master Bedroom' },
        { slug: 'kids-bedroom', title: 'Kids Bedroom' },
      ];
    case '3-bhk':
      return [
        { slug: 'master-bedroom', title: 'Master Bedroom' },
        { slug: 'kids-bedroom', title: 'Kids Bedroom' },
        { slug: 'guest-bedroom', title: 'Guest Bedroom' },
      ];
    case '4-bhk':
    case '4-plus-bhk':
      return [
        { slug: 'master-bedroom', title: 'Master Bedroom' },
        { slug: 'kids-bedroom', title: 'Kids Bedroom' },
        { slug: 'guest-bedroom', title: 'Guest Bedroom' },
        { slug: 'bedroom', title: 'Bedroom 4' },
      ];
    default:
      return [{ slug: 'master-bedroom', title: 'Master Bedroom' }];
  }
}

function buildResidentialRoomSuggestions(bhkSlug: string) {
  return [
    { slug: 'kitchen', title: 'Kitchen' },
    ...bedroomTemplatesForBhk(bhkSlug),
    { slug: 'bathroom', title: 'Bathroom', allowMultiple: true, numberedPrefix: 'Bathroom' },
    { slug: 'foyer', title: 'Foyer / Entrance' },
    { slug: 'pooja-room', title: 'Pooja Room' },
    { slug: 'balcony', title: 'Balcony' },
    { slug: 'home-office', title: 'Study / Home office' },
    { slug: 'dining', title: 'Dining Area' },
  ];
}

const projectTypeBehaviors: Record<string, ProjectTypeBehavior> = {
  apartment: {
    detailsTitle: 'Apartment details',
    detailsSubtitle: 'Fill in details specific to the apartment',
    primaryField: 'bhk',
    primaryLabel: 'BHK',
    primaryPlaceholder: 'Select BHK',
    buildingNameLabel: 'Apartment / Building name',
    defaultRooms: () => [
      { slug: 'kitchen', title: 'Kitchen' },
      { slug: 'master-bedroom', title: 'Master Bedroom' },
      { slug: 'bathroom', title: 'Bathroom' },
    ],
    suggestedRooms: buildResidentialRoomSuggestions,
  },
  villa: {
    detailsTitle: 'Villa details',
    detailsSubtitle: 'Fill in details specific to the villa',
    primaryField: 'bhk',
    primaryLabel: 'BHK',
    primaryPlaceholder: 'Select BHK',
    buildingNameLabel: 'Villa / Building name',
    defaultRooms: () => [
      { slug: 'kitchen', title: 'Kitchen' },
      { slug: 'master-bedroom', title: 'Master Bedroom' },
      { slug: 'bathroom', title: 'Bathroom' },
    ],
    suggestedRooms: (bhkSlug) => [
      ...buildResidentialRoomSuggestions(bhkSlug),
      { slug: 'garden-landscape', title: 'Garden / Landscape' },
      { slug: 'terrace-rooftop', title: 'Terrace / Rooftop' },
      { slug: 'garage-parking', title: 'Garage / Parking' },
      { slug: 'staff-quarters', title: 'Staff Quarters' },
    ],
  },
  'office-commercial': {
    detailsTitle: 'Commercial details',
    detailsSubtitle: 'Fill in details specific to this commercial project',
    primaryField: 'subtype',
    primaryLabel: 'Commercial type',
    primaryPlaceholder: 'Select type',
    subtypeOptions: commercialTypeOptions,
    defaultRooms: () => [
      { slug: 'cabin', title: 'Cabin 1' },
      { slug: 'workstation-open-seating', title: 'Workstation / Open Seating Area' },
      { slug: 'conference-room', title: 'Conference Room' },
    ],
    suggestedRooms: () => [
      { slug: 'cabin', title: 'Cabin', allowMultiple: true, numberedPrefix: 'Cabin', alwaysNumber: true },
      { slug: 'workstation-open-seating', title: 'Workstation / Open Seating Area' },
      { slug: 'conference-room', title: 'Conference Room' },
      { slug: 'cafeteria-pantry', title: 'Cafeteria / Pantry' },
      { slug: 'breakout-lounge', title: 'Breakout / Lounge Area' },
      { slug: 'server-room', title: 'Server Room' },
    ],
  },
  'institutional-public': {
    detailsTitle: 'Institutional details',
    detailsSubtitle: 'Fill in details specific to this institutional project',
    primaryField: 'subtype',
    primaryLabel: 'Institutional type',
    primaryPlaceholder: 'Select type',
    subtypeOptions: institutionalTypeOptions,
    defaultRooms: () => [
      { slug: 'lobby-reception', title: 'Lobby / Reception' },
      { slug: 'guest-room', title: 'Guest Room' },
      { slug: 'restaurant-dining', title: 'Restaurant / Dining' },
    ],
    suggestedRooms: () => [
      { slug: 'lobby-reception', title: 'Lobby / Reception' },
      { slug: 'guest-room', title: 'Guest Room', allowMultiple: true, numberedPrefix: 'Guest Room' },
      { slug: 'restaurant-dining', title: 'Restaurant / Dining' },
      { slug: 'spa-wellness', title: 'Spa / Wellness' },
      { slug: 'banquet-event-space', title: 'Banquet / Event Space' },
    ],
  },
  'retail-showroom': {
    detailsTitle: 'Showroom details',
    detailsSubtitle: 'Fill in details specific to this retail project',
    primaryField: 'subtype',
    primaryLabel: 'Showroom type',
    primaryPlaceholder: 'Select type',
    subtypeOptions: showroomTypeOptions,
    defaultRooms: () => [
      { slug: 'storefront-facade', title: 'Storefront / Facade' },
      { slug: 'display-area', title: 'Display Area' },
      { slug: 'billing-counter', title: 'Billing Counter' },
    ],
    suggestedRooms: () => [
      { slug: 'storefront-facade', title: 'Storefront / Facade' },
      { slug: 'display-area', title: 'Display Area' },
      { slug: 'billing-counter', title: 'Billing Counter' },
      { slug: 'trial-room', title: 'Trial Room' },
      { slug: 'storage-back-room', title: 'Storage / Back Room' },
      { slug: 'customer-lounge', title: 'Customer Lounge' },
    ],
  },
  'cafe-restaurant': {
    detailsTitle: 'Restaurant details',
    detailsSubtitle: 'Fill in details specific to this hospitality project',
    primaryField: 'subtype',
    primaryLabel: 'Restaurant type',
    primaryPlaceholder: 'Select type',
    subtypeOptions: restaurantTypeOptions,
    defaultRooms: () => [
      { slug: 'dining-area', title: 'Dining Area' },
      { slug: 'kitchen', title: 'Kitchen' },
      { slug: 'bar-counter', title: 'Bar Counter' },
    ],
    suggestedRooms: () => [
      { slug: 'dining-area', title: 'Dining Area' },
      { slug: 'kitchen', title: 'Kitchen' },
      { slug: 'bar-counter', title: 'Bar Counter' },
      { slug: 'outdoor-seating', title: 'Outdoor Seating' },
      { slug: 'private-dining-room', title: 'Private Dining Room' },
      { slug: 'billing-takeaway-counter', title: 'Billing / Takeaway Counter' },
      { slug: 'packing-station', title: 'Packing Station' },
    ],
  },
};

function makeRoomDraft(seed: { roomSlug: string; title: string }, index: number): RoomDraft {
  return {
    clientId: `room-${index}-${seed.roomSlug}`,
    roomSlug: seed.roomSlug,
    title: seed.title,
    description: '',
    expanded: index === 0,
    designStyle: '',
    materialFinish: '',
    tags: [],
    tagInput: '',
    images: [],
    uploading: false,
    uploadError: '',
  };
}

function propertyTypeLabel(slug: string, options: ProjectTypeOption[]) {
  return options.find((option) => option.slug === slug)?.label ?? 'Project';
}

function getProjectTypeBehavior(slug: string): ProjectTypeBehavior {
  return projectTypeBehaviors[slug] ?? projectTypeBehaviors.apartment!;
}

function buildDefaultRooms(slug: string, bhkSlug: string) {
  return getProjectTypeBehavior(slug).defaultRooms(bhkSlug);
}

function buildSuggestedRooms(slug: string, bhkSlug: string) {
  return getProjectTypeBehavior(slug).suggestedRooms(bhkSlug);
}

function findRoomTypeId(roomTerms: TaxonomyTerm[], slug: string) {
  const exactMatch = roomTerms.find((term) => term.slug === slug);
  if (exactMatch) return exactMatch.id;

  const alias = roomSlugCandidates(slug);
  return roomTerms.find((term) => alias.includes(term.slug))?.id;
}

function extractApiMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    payload.error &&
    typeof payload.error === 'object' &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
  ) {
    const details =
      'details' in payload.error && Array.isArray(payload.error.details)
        ? payload.error.details
            .map((detail) => {
              if (!detail || typeof detail !== 'object') return null;
              const path = 'path' in detail && typeof detail.path === 'string' ? detail.path : '';
              const message = 'message' in detail && typeof detail.message === 'string' ? detail.message : '';
              return [path, message].filter(Boolean).join(': ');
            })
            .filter(Boolean)
        : [];

    if (details.length > 0) {
      return `${payload.error.message}: ${details.join(', ')}`;
    }

    return payload.error.message;
  }
  return fallback;
}

function parseApiPayload<T>(payload: unknown, schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, fallback: string): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(fallback);
  }
  return parsed.data;
}

function normalizeRoomSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function isLocalPreviewImage(image: ProjectImagePreview) {
  return image.id.startsWith('local-preview-');
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function metadataString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function metadataStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function metadataNumberString(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function inferUiProjectType(project: ProjectDetailResponse) {
  const metadata = metadataRecord(project.metadata);
  const storedProjectType = metadataString(metadata.uiProjectTypeSlug);
  if (supportedProjectTypeSlugs.includes(storedProjectType)) return storedProjectType;

  switch (project.propertySubtypeSlug) {
    case 'apartment':
      return 'apartment';
    case 'villa':
      return 'villa';
  }

  switch (project.propertyTypeSlug) {
    case 'commercial-workspace':
      return 'office-commercial';
    case 'institutional-public':
      return 'institutional-public';
    case 'retail-showroom':
      return 'retail-showroom';
    case 'food-hospitality':
      return 'cafe-restaurant';
    case 'residential':
    default:
      return 'apartment';
  }
}

function firstAttributeLabel(
  metadata: ProjectRoom['metadata'],
  key: string,
) {
  const attributes = metadataRecord(metadata.attributeLabels);
  return metadataStringArray(attributes[key])[0] ?? '';
}

function roomSlugFromRoom(room: ProjectRoom, roomTerms: TaxonomyTerm[]) {
  return roomTerms.find((term) => term.id === room.roomTypeId)?.slug ?? room.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function roomTitleFromRoom(room: ProjectRoom, roomTerms: TaxonomyTerm[]) {
  return room.name || roomTerms.find((term) => term.id === room.roomTypeId)?.label || 'Project room';
}

function attachExistingProjectRoomsToDrafts(
  draftRooms: RoomDraft[],
  projectRooms: ProjectRoom[],
  roomTerms: TaxonomyTerm[],
) {
  const usedProjectRoomIds = new Set<string>();

  function findMatch(room: RoomDraft) {
    const candidates = projectRooms.filter((projectRoom) => !usedProjectRoomIds.has(projectRoom.id));

    const titleMatch = candidates.find(
      (projectRoom) =>
        normalizeRoomSearchValue(room.title) === normalizeRoomSearchValue(roomTitleFromRoom(projectRoom, roomTerms)),
    );
    if (titleMatch) return titleMatch;

    return candidates.find((projectRoom) => roomSlugsMatch(room.roomSlug, roomSlugFromRoom(projectRoom, roomTerms)));
  }

  return draftRooms.map((room) => {
    if (room.id) return room;

    const match = findMatch(room);

    if (!match) return room;

    usedProjectRoomIds.add(match.id);

    return {
      ...room,
      id: match.id,
      roomTypeId: match.roomTypeId,
      description: room.description || match.description || '',
    };
  });
}

function toProjectImagePreview(image: ProjectImageDto, index: number, existing?: ProjectImagePreview): ProjectImagePreview {
  return {
    id: image.id,
    status: image.status,
    sortOrder: image.sortOrder,
    width: image.width,
    height: image.height,
    fileName: existing?.fileName ?? `Image ${index + 1}`,
    previewUrl: image.previewUrl ?? existing?.previewUrl,
  };
}

function mapRoomMetadata(room: RoomDraft) {
  return {
    labels: room.tags,
    attributeLabels: {
      ...(room.designStyle ? { theme: [room.designStyle] } : {}),
      ...(room.materialFinish ? { finish: [room.materialFinish] } : {}),
    },
  };
}

function FormSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className={cn(typography.label, 'text-foreground')}>{label}</Label>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-9 shadow-xs transition-colors',
            typography.control,
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            !value && 'text-muted-foreground',
          )}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  helperText,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: 'text' | 'number' | 'month';
  helperText?: string;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className={cn(typography.label, 'text-foreground')}>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={typography.control}
      />
      {helperText ? (
        <p className={cn(typography.bodySmall, 'text-muted-foreground')}>{helperText}</p>
      ) : null}
    </div>
  );
}

function SectionFrame({
  step,
  title,
  open,
  onToggle,
  children,
}: {
  step: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section>
      <Card className="overflow-hidden rounded-[20px] border-border/80 shadow-sm">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'flex w-full items-start justify-between gap-4 px-5 text-left transition-[padding] duration-300 ease-out sm:px-6 motion-reduce:transition-none',
            open ? 'pt-4 pb-3' : 'py-4',
          )}
        >
          <div>
            <div className={cn(typography.stepLabel, 'text-primary')}>{step}</div>
            <h2 className={cn(typography.sectionTitle, 'mt-0 text-foreground')}>
              {title}
            </h2>
          </div>
          <ChevronDown className={cn('mt-1 size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>

        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
            open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
        >
          <div className={cn('min-h-0 overflow-hidden', !open && 'invisible pointer-events-none')}>
            <CardContent className="p-0">
              <Divider />
              {children}
            </CardContent>
          </div>
        </div>
      </Card>
    </section>
  );
}

function Divider() {
  return <div className="h-px w-full bg-border/80" />;
}

function ProjectTypeCard({
  option,
  selected,
  onSelect,
}: {
  option: ProjectTypeOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex h-[110px] w-[150px] shrink-0 flex-col items-center rounded-[18px] border px-3 py-4 text-center transition-colors',
        selected
          ? 'border-primary bg-primary/5 text-primary shadow-sm ring-1 ring-primary/20'
          : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground',
      )}
    >
      <div className="flex h-[68px] items-center justify-center">
        <Image
          src={option.imageSrc}
          alt=""
          width={option.imageWidth}
          height={option.imageHeight}
          className="h-auto max-h-[50px] w-auto"
        />
      </div>
      <span className={cn(typography.navText, 'mt-2')}>{option.label}</span>
    </button>
  );
}

function ScopeChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-4 py-2 transition-colors',
        typography.navText,
        active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function ChecklistCard({
  title,
  icon,
  items,
}: {
  title: string;
  icon: ReactNode;
  items: Array<{ label: string; done: boolean }>;
}) {
  return (
    <div>
      <div className={cn(typography.monoEyebrow, 'mb-3 flex items-center gap-2 px-1 text-muted-foreground')}>
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      <Card className="overflow-hidden rounded-2xl border-border/80">
        <CardContent className="p-0">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-3 border-b border-border/70 px-4 py-3 last:border-b-0">
              {item.done ? (
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Check className="size-3.5" />
                </span>
              ) : (
                <CircleDashed className="size-5 text-muted-foreground" />
              )}
              <span className={cn(typography.bodyMedium, item.done ? 'text-primary' : 'text-muted-foreground')}>{item.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function TipsCard() {
  const tips = [
    'Use high quality, well-lit images',
    'Tag every photo with room, finish & style',
    'Add a cost range — builds trust',
    'Write a compelling project story',
    'Upload renders for design-only projects',
  ];

  return (
    <div>
      <div className={cn(typography.monoEyebrow, 'mb-3 flex items-center gap-2 px-1 text-muted-foreground')}>
        <Sparkles className="size-3.5 text-primary" />
        Tips for better visibility
      </div>
      <Card className="rounded-2xl border-border/80">
        <CardContent className="space-y-4 p-4">
          {tips.map((tip) => (
            <div key={tip} className="flex items-start gap-3">
              <Check className="mt-0.5 size-4 text-primary" />
              <p className={cn(typography.bodyMedium, 'text-muted-foreground')}>{tip}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function WhyItMattersCard() {
  return (
    <div>
      <div className={cn(typography.monoEyebrow, 'mb-3 flex items-center gap-2 px-1 text-muted-foreground')}>
        <Info className="size-3.5 text-primary" />
        Tip
      </div>
      <Card className="rounded-2xl border-primary/10 bg-primary/5">
        <CardContent className="p-4">
          <div className="mb-6 overflow-hidden rounded-2xl">
            <Image
              src="/illustrations/project-upload/project-upload-why-it-matters.svg"
              alt=""
              width={255}
              height={140}
              className="h-auto w-full"
            />
          </div>
          <h3 className={cn(typography.sectionTitle, 'text-muted-foreground')}>Why it matters?</h3>
          <p className={cn(typography.bodySmall, 'mt-2 text-muted-foreground')}>
            Complete projects with photos, metadata, and cost info get 3× more enquiries.
            Homeowners trust designers who show real work.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function TagInput({
  tags,
  value,
  onValueChange,
  onAddTag,
  onRemoveTag,
}: {
  tags: string[];
  value: string;
  onValueChange: (value: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className={cn(typography.label, 'text-foreground')}>
        Search tags <span className="text-muted-foreground">(Optional)</span>
      </Label>
      <div className="rounded-md border border-input bg-background px-3 py-2 shadow-xs">
        <div className="mb-2 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onRemoveTag(tag)}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
            >
              <span>{tag}</span>
              <span className="text-muted-foreground">×</span>
            </button>
          ))}
        </div>
        <Input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              const next = value.trim();
              if (next) onAddTag(next);
            }
          }}
          className={cn('h-8 border-0 px-0 py-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0', typography.control)}
          placeholder="accent wall, marble counter"
        />
      </div>
    </div>
  );
}

type RoomCardProps = {
  room: RoomDraft;
  styleOptions: Array<{ value: string; label: string }>;
  finishOptions: Array<{ value: string; label: string }>;
  onToggle: () => void;
  onDelete: () => void;
  onDescriptionChange: (value: string) => void;
  onDesignStyleChange: (value: string) => void;
  onMaterialFinishChange: (value: string) => void;
  onTagInputChange: (value: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onSetCover: (imageId: string) => void;
  onMoveImage: (imageId: string, direction: ProjectImageMoveDirection) => void;
  onRemoveImage: (imageId: string) => void;
  coverImageId: string | null;
  allowDelete: boolean;
};

function RoomCard({
  room,
  styleOptions,
  finishOptions,
  onToggle,
  onDelete,
  onDescriptionChange,
  onDesignStyleChange,
  onMaterialFinishChange,
  onTagInputChange,
  onAddTag,
  onRemoveTag,
  onUpload,
  onSetCover,
  onMoveImage,
  onRemoveImage,
  coverImageId,
  allowDelete,
}: RoomCardProps) {
  const imageCount = room.images.length;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-background">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className={cn(typography.subsectionTitle, 'text-foreground')}>{room.title}</div>
          <div className={cn(typography.bodySmall, 'mt-1 text-muted-foreground')}>
            {imageCount > 0 ? `${imageCount} photo${imageCount === 1 ? '' : 's'} added` : 'No photos yet'}
          </div>
        </button>
        <div className="flex items-center gap-2">
          {allowDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={`Delete ${room.title}`}
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={`Toggle ${room.title}`}
          >
            <ChevronDown className={cn('size-4 transition-transform', room.expanded && 'rotate-180')} />
          </button>
        </div>
      </div>

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
          room.expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className={cn('min-h-0 overflow-hidden', !room.expanded && 'invisible pointer-events-none')}>
          <Divider />
          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1.5">
              <Label className={cn(typography.label, 'text-foreground')}>About this room</Label>
              <Textarea
                value={room.description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder="Optional"
                className={cn('min-h-24 resize-y', typography.control)}
              />
            </div>

            <label className="block cursor-pointer rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/5">
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" onChange={onUpload} />
              <ImagePlus className="mx-auto size-5 text-muted-foreground" />
              <div className={cn(typography.label, 'mt-3 text-foreground')}>Upload Files</div>
              <div className={cn(typography.bodySmall, 'mt-1 text-muted-foreground')}>
                Drag and drop files here or click to upload
              </div>
              {room.uploading ? (
                <div className={cn(typography.bodyMedium, 'mt-3 inline-flex items-center gap-2 text-primary')}>
                  <Loader2 className="size-4 animate-spin" />
                  Uploading…
                </div>
              ) : null}
            </label>

            {room.uploadError ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{room.uploadError}</AlertDescription>
              </Alert>
            ) : null}

            {room.images.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {room.images.map((image, index) => {
                  const statusLabel =
                    image.status === 'ready' ? 'Ready' : image.status === 'processing' ? 'Processing' : 'Failed';
                  const canPersistImage = !isLocalPreviewImage(image);
                  const isCover = coverImageId === image.id;

                  return (
                    <div
                      key={image.id}
                      className={cn(
                        'relative overflow-hidden rounded-xl border bg-muted/40',
                        isCover ? 'border-primary ring-1 ring-primary/20' : 'border-border',
                      )}
                      title={`${image.fileName} · ${statusLabel}`}
                    >
                      <button
                        type="button"
                        onClick={() => onRemoveImage(image.id)}
                        className="absolute top-1.5 right-1.5 z-10 inline-flex size-6 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground shadow-sm transition-colors hover:bg-background hover:text-foreground"
                        aria-label={`Remove ${image.fileName}`}
                      >
                        <X className="size-3.5" />
                      </button>
                      <div className="flex gap-3 p-2">
                        <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                          {image.previewUrl ? (
                            <div
                              role="img"
                              aria-label={`${image.fileName} (${statusLabel})`}
                              className="h-full w-full bg-cover bg-center"
                              style={{ backgroundImage: `url(${image.previewUrl})` }}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <ImagePlus className="size-4" aria-hidden="true" />
                              <span className="sr-only">{`${image.fileName} (${statusLabel})`}</span>
                            </div>
                          )}
                          {image.status === 'processing' ? (
                            <span className="absolute inset-x-0 bottom-0 h-1 animate-pulse bg-primary/70" aria-hidden="true" />
                          ) : null}
                          {image.status === 'failed' ? (
                            <span className="absolute inset-0 bg-destructive/20" aria-hidden="true" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={cn(typography.bodyMedium, 'truncate text-foreground')}>
                              {image.fileName}
                            </span>
                            {isCover ? <Star className="size-3.5 shrink-0 fill-primary text-primary" /> : null}
                          </div>
                          <div className={cn(typography.bodySmall, 'mt-1 text-muted-foreground')}>
                            {statusLabel}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Button
                              type="button"
                              variant={isCover ? 'secondary' : 'outline'}
                              size="sm"
                              disabled={!canPersistImage}
                              onClick={() => onSetCover(image.id)}
                              className="h-7 px-2 text-[11px]"
                            >
                              <Star className="size-3" />
                              {isCover ? 'Cover' : 'Set cover'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={index === 0}
                              onClick={() => onMoveImage(image.id, 'previous')}
                              className="size-7"
                              aria-label={`Move ${image.fileName} earlier`}
                            >
                              <ArrowLeft className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={index === room.images.length - 1}
                              onClick={() => onMoveImage(image.id, 'next')}
                              className="size-7"
                              aria-label={`Move ${image.fileName} later`}
                            >
                              <ArrowRight className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <FormSelect
                label="Design style"
                value={room.designStyle}
                onChange={onDesignStyleChange}
                options={styleOptions}
                placeholder="Optional"
              />
              <FormSelect
                label="Material & finish"
                value={room.materialFinish}
                onChange={onMaterialFinishChange}
                options={finishOptions}
                placeholder="Optional"
              />
            </div>

            <TagInput
              tags={room.tags}
              value={room.tagInput}
              onValueChange={onTagInputChange}
              onAddTag={onAddTag}
              onRemoveTag={onRemoveTag}
            />

            <div className={cn('rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-primary', typography.bodyMedium)}>
              Tagging photos gets you 2× more search appearances. Use keywords like accent wall, marble counter, window — the more specific, the better your reach.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DesignerProjectUpload({
  initialProjectId,
}: {
  initialProjectId?: string;
}) {
  const router = useRouter();
  const [loadingTaxonomy, setLoadingTaxonomy] = useState(true);
  const [cities, setCities] = useState<TaxonomyTerm[]>([]);
  const [localities, setLocalities] = useState<TaxonomyTerm[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<TaxonomyTerm[]>([]);
  const [propertySubtypes, setPropertySubtypes] = useState<TaxonomyTerm[]>([]);
  const [bhkOptions, setBhkOptions] = useState<TaxonomyTerm[]>([]);
  const [roomTerms, setRoomTerms] = useState<TaxonomyTerm[]>([]);
  const [scopeTerms, setScopeTerms] = useState<TaxonomyTerm[]>([]);
  const [themeTerms, setThemeTerms] = useState<TaxonomyTerm[]>([]);
  const [finishTerms, setFinishTerms] = useState<TaxonomyTerm[]>([]);
  const [budgetBandTerms, setBudgetBandTerms] = useState<TaxonomyTerm[]>([]);
  const [taxonomyError, setTaxonomyError] = useState('');

  const [projectId, setProjectId] = useState<string | null>(null);
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [coverImageId, setCoverImageId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [aboutProject, setAboutProject] = useState('');
  const [projectType, setProjectType] = useState('apartment');
  const [projectSubtype, setProjectSubtype] = useState('');
  const [bhkSlug, setBhkSlug] = useState('');
  const [sizeSqft, setSizeSqft] = useState('');
  const [citySlug, setCitySlug] = useState('');
  const [locality, setLocality] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['construction']);
  const [completedByMonth, setCompletedByMonth] = useState('');
  const [projectDuration, setProjectDuration] = useState('');
  const [budgetBandSlug, setBudgetBandSlug] = useState('');
  const [rooms, setRooms] = useState<RoomDraft[]>(() =>
    buildDefaultRooms('apartment', '').map((seed, index) =>
      makeRoomDraft({ roomSlug: seed.slug, title: seed.title }, index),
    ),
  );
  const [sections, setSections] = useState<Record<SectionId, boolean>>({
    classification: true,
    timeline: false,
    metadata: false,
    images: false,
  });
  const [roomSearchOpen, setRoomSearchOpen] = useState(false);
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [completion, setCompletion] = useState<ProjectCompletenessResponse | null>(null);
  const previewUrlsRef = useRef(new Set<string>());
  const errorAlertRef = useRef<HTMLDivElement | null>(null);
  const ensureProjectPromiseRef = useRef<Promise<{ projectId: string; rooms: RoomDraft[] }> | null>(null);

  const selectedCity = useMemo(
    () => cities.find((term) => term.slug === citySlug) ?? null,
    [cities, citySlug],
  );
  const availablePropertyTypeSlugs = useMemo(
    () => new Set(propertyTypes.map((term) => term.slug)),
    [propertyTypes],
  );
  const availablePropertySubtypeSlugs = useMemo(
    () => new Set(propertySubtypes.map((term) => term.slug)),
    [propertySubtypes],
  );
  const projectTypeOptions = useMemo<ProjectTypeOption[]>(
    () => {
      const termsBySlug = new Map(propertyTypes.map((term) => [term.slug, term]));

      return supportedProjectTypeSlugs.map((slug) => ({
        slug,
        label: termsBySlug.get(slug)?.label ?? fallbackProjectTypeLabels[slug] ?? slug,
        ...projectTypeVisuals[slug]!,
      }));
    },
    [propertyTypes],
  );
  const scopeOptions = useMemo(
    () =>
      scopeTerms
        .filter((term) => projectDeliveryScopeSlugs.includes(term.slug))
        .map((term) => ({ value: term.slug, label: term.label })),
    [scopeTerms],
  );
  const budgetOptions = useMemo(
    () => budgetBandTerms.map((term) => ({ value: term.slug, label: term.label })),
    [budgetBandTerms],
  );
  const propertySubtypeLabelBySlug = useMemo(
    () => new Map(propertySubtypes.map((term) => [term.slug, term.label])),
    [propertySubtypes],
  );
  const selectedProjectTypeLabel = useMemo(
    () => propertyTypeLabel(projectType, projectTypeOptions),
    [projectType, projectTypeOptions],
  );
  const selectedProjectTypeBehavior = useMemo(() => getProjectTypeBehavior(projectType), [projectType]);
  const suggestedRooms = useMemo(() => buildSuggestedRooms(projectType, bhkSlug), [bhkSlug, projectType]);
  const detailSubtypeOptions = useMemo(
    () =>
      (selectedProjectTypeBehavior.subtypeOptions ?? []).map((option) => ({
        value: option.slug,
        label: propertySubtypeLabelBySlug.get(option.slug) ?? option.label,
      })),
    [propertySubtypeLabelBySlug, selectedProjectTypeBehavior],
  );
  const defaultRoomCount = useMemo(() => buildDefaultRooms(projectType, bhkSlug).length, [bhkSlug, projectType]);
  const selectedProjectSubtypeLabel = useMemo(
    () => detailSubtypeOptions.find((option) => option.value === projectSubtype)?.label ?? '',
    [detailSubtypeOptions, projectSubtype],
  );
  const backendProjectSelectionState = useMemo<BackendProjectSelectionState>(
    () => {
      try {
        return {
          selection: getBackendProjectSelection({
            projectType,
            projectSubtype,
            availablePropertyTypeSlugs,
            availablePropertySubtypeSlugs,
          }),
          error: '',
        };
      } catch (selectionError) {
        return {
          selection: null,
          error: selectionError instanceof Error ? selectionError.message : 'Project type taxonomy is not ready. Please refresh and try again.',
        };
      }
    },
    [availablePropertySubtypeSlugs, availablePropertyTypeSlugs, projectSubtype, projectType],
  );
  const backendProjectSelection = backendProjectSelectionState.selection;
  const backendProjectSelectionError = backendProjectSelectionState.error;

  useEffect(() => {
    if (!backendProjectSelectionError) return;
    setError(backendProjectSelectionError);
  }, [backendProjectSelectionError]);

  useEffect(() => {
    if (backendProjectSelectionError || !error) return;
    if (!error.startsWith('Project type taxonomy is missing') && !error.startsWith('Project subtype taxonomy is missing')) return;
    setError('');
  }, [backendProjectSelectionError, error]);

  const selectedLocality = useMemo(
    () => localities.find((term) => term.slug === locality) ?? null,
    [localities, locality],
  );
  const selectedScopeSlug = selectedScopes[0] ?? '';

  const totalImages = useMemo(
    () => rooms.reduce((count, room) => count + room.images.length, 0),
    [rooms],
  );
  const hasProcessingImages = useMemo(
    () =>
      rooms.some((room) =>
        room.images.some((image) => image.status === 'processing' && !isLocalPreviewImage(image)),
      ),
    [rooms],
  );

  const localChecklist = useMemo(
    () => [
      { label: 'Project name', done: projectName.trim().length >= 3 },
      { label: 'Location (city)', done: citySlug.length > 0 },
      { label: 'Project type', done: projectType.length > 0 },
      { label: 'Scope (Design / Execution)', done: selectedScopes.length > 0 },
      { label: 'At least 3 photos', done: totalImages >= 3 },
      {
        label: 'Room, theme, and finish metadata on each photo',
        done:
          totalImages >= 3 &&
          rooms.every(
            (room) =>
              room.images.length === 0 ||
              (room.designStyle.length > 0 && room.materialFinish.length > 0),
          ),
      },
      { label: 'Cost range selected', done: budgetBandSlug.length > 0 },
    ],
    [budgetBandSlug, citySlug, projectName, projectType, rooms, selectedScopes.length, totalImages],
  );
  const requiredChecklist = useMemo(
    () =>
      completion
        ? completion.requirements.map((requirement) => ({
            label: requirement.label,
            done: requirement.complete,
          }))
        : localChecklist,
    [completion, localChecklist],
  );

  async function loadTerms(kind: string, parentId?: string) {
    const response = await api.api.taxonomy.terms.$get({ query: parentId ? { kind, parentId } : { kind } });
    if (!response.ok) {
      throw new Error(`Could not load ${kind} options.`);
    }
    const payload = await response.json();
    return parseApiPayload(payload, listTaxonomyResponseSchema, `Could not load ${kind} options.`).terms;
  }

  useEffect(() => {
    return () => {
      for (const previewUrl of previewUrlsRef.current) {
        URL.revokeObjectURL(previewUrl);
      }
      previewUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!notice) return;

    const timer = window.setTimeout(() => {
      setNotice('');
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoadingTaxonomy(true);
      setTaxonomyError('');
      try {
        const [
          cityTerms,
          propertyTypeTerms,
          propertySubtypeTerms,
          bhkTerms,
          roomTypeTerms,
          scopeTypeTerms,
          themeTypeTerms,
          finishTypeTerms,
          budgetBandTypeTerms,
        ] = await Promise.all([
          loadTerms('city'),
          loadTerms('property_type'),
          loadTerms('property_subtype').catch(() => []),
          loadTerms('bhk'),
          loadTerms('room'),
          loadTerms('scope'),
          loadTerms('theme'),
          loadTerms('finish'),
          loadTerms('budget_band'),
        ]);

        if (cancelled) return;
        setCities(cityTerms);
        setPropertyTypes(propertyTypeTerms);
        setPropertySubtypes(propertySubtypeTerms);
        setBhkOptions(bhkTerms);
        setRoomTerms(roomTypeTerms);
        setScopeTerms(scopeTypeTerms);
        setThemeTerms(themeTypeTerms);
        setFinishTerms(finishTypeTerms);
        setBudgetBandTerms(budgetBandTypeTerms);
      } catch (loadError) {
        if (!cancelled) {
          setTaxonomyError(loadError instanceof Error ? loadError.message : 'Could not load project form options.');
        }
      } finally {
        if (!cancelled) setLoadingTaxonomy(false);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLocalityTerms() {
      if (!selectedCity) {
        setLocalities([]);
        return;
      }

      try {
        const terms = await loadTerms('locality', selectedCity.id);
        if (!cancelled) setLocalities(terms);
      } catch {
        if (!cancelled) setLocalities([]);
      }
    }

    void loadLocalityTerms();
    return () => {
      cancelled = true;
    };
  }, [selectedCity]);

  useEffect(() => {
    if (!initialProjectId || loadingTaxonomy || loadedProjectId === initialProjectId) return;

    let cancelled = false;
    const draftProjectId = initialProjectId;

    async function loadProjectDraft() {
      setLoadingProject(true);
      setError('');
      setNotice('');

      try {
        const projectResponse = await api.api.projects[':id'].$get({
          param: { id: draftProjectId },
        });
        const projectPayload = await projectResponse.json();

        if (!projectResponse.ok) {
          throw new Error(extractApiMessage(projectPayload, 'Could not load this project draft.'));
        }

        const project = parseApiPayload(
          projectPayload,
          projectDetailResponseSchema,
          'Could not load this project draft.',
        );
        const imagesResponse = await api.api.projects[':id'].images.$get({
          param: { id: project.id },
          query: { limit: 100, offset: 0 },
        });
        const imagesPayload = await imagesResponse.json();

        if (!imagesResponse.ok) {
          throw new Error(extractApiMessage(imagesPayload, 'Could not load this project draft images.'));
        }

        if (cancelled) return;

        const projectImagePayload = parseApiPayload(
          imagesPayload,
          listProjectImagesResponseSchema,
          'Could not load this project draft images.',
        );
        const projectMetadata = metadataRecord(project.metadata);
        const projectImages = (projectImagePayload.items ?? []).sort(
          (left, right) => left.sortOrder - right.sortOrder,
        );
        const imagesByRoom = new Map<string, ProjectImageDto[]>();
        for (const image of projectImages) {
          if (!image.roomId) continue;
          const roomImages = imagesByRoom.get(image.roomId) ?? [];
          roomImages.push(image);
          imagesByRoom.set(image.roomId, roomImages);
        }

        const hydratedRooms = project.rooms.length > 0
          ? project.rooms
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((room, index) => {
              const roomImages = imagesByRoom.get(room.id) ?? [];
              return {
                clientId: `room-${index}-${room.id}`,
                id: room.id,
                roomSlug: roomSlugFromRoom(room, roomTerms),
                roomTypeId: room.roomTypeId,
                title: roomTitleFromRoom(room, roomTerms),
                description: room.description ?? '',
                expanded: index === 0,
                designStyle: firstAttributeLabel(room.metadata, 'theme') || roomImages[0]?.themeSlugs[0] || '',
                materialFinish: firstAttributeLabel(room.metadata, 'finish') || roomImages[0]?.finishSlugs[0] || '',
                tags: room.metadata.labels ?? roomImages[0]?.tagSlugs ?? [],
                tagInput: '',
                images: roomImages.map((image, imageIndex) => toProjectImagePreview(image, imageIndex)),
                uploading: false,
                uploadError: '',
              } satisfies RoomDraft;
            })
          : buildDefaultRooms(inferUiProjectType(project), project.bhkSlug ?? '').map((seed, index) =>
            makeRoomDraft({ roomSlug: seed.slug, title: seed.title }, index),
          );

        setProjectId(project.id);
        setLoadedProjectId(project.id);
        setProjectName(project.title);
        setAboutProject(project.description ?? '');
        setProjectType(inferUiProjectType(project));
        setProjectSubtype(project.propertySubtypeSlug ?? metadataString(projectMetadata.projectSubtypeSlug));
        setBhkSlug(project.bhkSlug ?? '');
        setSizeSqft(metadataNumberString(project.sizeSqft));
        setCitySlug(project.citySlug ?? '');
        setLocality(project.localitySlug ?? metadataString(projectMetadata.localityLabel));
        setBuildingName(project.buildingName ?? '');
        setSelectedScopes(
          project.scopeSlug
            ? [project.scopeSlug]
            : metadataStringArray(projectMetadata.scopeSlugs).slice(0, 1),
        );
        setCompletedByMonth(project.completedMonth ?? '');
        setProjectDuration(project.durationMonths ? `${project.durationMonths} months` : '');
        setBudgetBandSlug(project.budgetBandSlug ?? '');
        setCoverImageId(project.coverImageId);
        setRooms(hydratedRooms);
        setSections({ classification: true, timeline: true, metadata: true, images: true });
        setNotice('Draft loaded. You can continue editing from here.');
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load this project draft.');
        }
      } finally {
        if (!cancelled) setLoadingProject(false);
      }
    }

    void loadProjectDraft();

    return () => {
      cancelled = true;
    };
  }, [initialProjectId, loadedProjectId, loadingTaxonomy, roomTerms]);

  useEffect(() => {
    if (projectTypeOptions.length === 0) return;
    if (projectTypeOptions.some((option) => option.slug === projectType)) return;

    setProjectType(projectTypeOptions[0]!.slug);
  }, [projectType, projectTypeOptions]);

  useEffect(() => {
    if (scopeOptions.length === 0) return;

    const allowedScopes = new Set(scopeOptions.map((option) => option.value));
    setSelectedScopes((current) => {
      const next = current.filter((scope) => allowedScopes.has(scope));

      if (next.length > 0) {
        return next.length === current.length ? current : next;
      }

      return allowedScopes.has('construction') ? ['construction'] : [];
    });
  }, [scopeOptions]);

  useEffect(() => {
    if (selectedProjectTypeBehavior.primaryField !== 'bhk' && bhkSlug) {
      setBhkSlug('');
    }
  }, [bhkSlug, selectedProjectTypeBehavior.primaryField]);

  useEffect(() => {
    if (selectedProjectTypeBehavior.primaryField === 'bhk' && projectSubtype) {
      setProjectSubtype('');
    }
  }, [projectSubtype, selectedProjectTypeBehavior.primaryField]);

  useEffect(() => {
    setRooms((currentRooms) => {
      const nextDefaultRooms = buildDefaultRooms(projectType, bhkSlug).map((seed, index) =>
        makeRoomDraft({ roomSlug: seed.slug, title: seed.title }, index),
      );

      return shouldRefreshPristineDefaultRooms(currentRooms, nextDefaultRooms)
        ? nextDefaultRooms
        : currentRooms;
    });
  }, [bhkSlug, projectType]);

  useEffect(() => {
    if (!projectId || !hasProcessingImages) return;

    let cancelled = false;
    const timer = window.setInterval(() => {
      refreshProjectImages(projectId).catch(() => {
        if (!cancelled) {
          setError('Could not refresh image processing status. Save the draft or refresh the page in a moment.');
        }
      });
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hasProcessingImages, projectId]);

  function toggleSection(section: SectionId) {
    setSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function toggleScope(scope: string) {
    setSelectedScopes([scope]);
  }

  function handleProjectTypeSelect(nextProjectType: string) {
    setProjectType(nextProjectType);
    setProjectSubtype('');
    setCompletion(null);
  }

  function updateRoom(clientId: string, updater: (room: RoomDraft) => RoomDraft) {
    setRooms((current) => current.map((room) => (room.clientId === clientId ? updater(room) : room)));
  }

  function mergeServerImages(serverImages: ProjectImageDto[]) {
    setRooms((currentRooms) =>
      currentRooms.map((room) => {
        if (!room.id) return room;

        const existingById = new Map(room.images.map((image) => [image.id, image]));
        const localPreviews = room.images.filter(isLocalPreviewImage);
        const roomServerImages = serverImages
          .filter((image) => image.roomId === room.id)
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((image, index) => toProjectImagePreview(image, index, existingById.get(image.id)));

        return {
          ...room,
          images: [...roomServerImages, ...localPreviews],
        };
      }),
    );
  }

  async function refreshProjectImages(currentProjectId: string) {
    const response = await api.api.projects[':id'].images.$get({
      param: { id: currentProjectId },
      query: { limit: 100, offset: 0 },
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(extractApiMessage(payload, 'Could not refresh image processing status.'));
    }

    const imagePayload = parseApiPayload(
      payload,
      listProjectImagesResponseSchema,
      'Could not refresh image processing status.',
    );
    const images = imagePayload.items ?? [];
    mergeServerImages(images);
    return images;
  }

  function revokePreviewUrl(previewUrl?: string) {
    if (!previewUrl) return;
    URL.revokeObjectURL(previewUrl);
    previewUrlsRef.current.delete(previewUrl);
  }

  function removeImageFromRoom(clientId: string, imageId: string, revokePreview = true) {
    updateRoom(clientId, (current) => {
      const removedImage = current.images.find((image) => image.id === imageId);
      if (revokePreview) revokePreviewUrl(removedImage?.previewUrl);
      return {
        ...current,
        images: current.images.filter((image) => image.id !== imageId),
      };
    });

    setCoverImageId((current) => (current === imageId ? null : current));
  }

  function removeRoom(clientId: string) {
    setRooms((current) => {
      const removedRoom = current.find((room) => room.clientId === clientId);
      removedRoom?.images.forEach((image) => revokePreviewUrl(image.previewUrl));
      return current.filter((room) => room.clientId !== clientId);
    });
  }

  function handleSetCover(imageId: string) {
    if (imageId.startsWith('local-preview-')) return;

    setCoverImageId(imageId);
    setNotice('Cover image selected. Save the draft to persist it.');
    setError('');
  }

  async function handleMoveImage(room: RoomDraft, imageId: string, direction: ProjectImageMoveDirection) {
    const nextImages = moveProjectImage(room.images, imageId, direction);
    if (nextImages === room.images) return;

    updateRoom(room.clientId, (current) => ({
      ...current,
      images: moveProjectImage(current.images, imageId, direction),
    }));
    setError('');
    setNotice('Image order updated.');

    if (!projectId || !room.id) return;

    try {
      await Promise.all(
        nextImages
          .filter((image) => !isLocalPreviewImage(image))
          .map((image, index) =>
            api.api.projects[':id'].images[':imageId'].$patch({
              param: { id: projectId, imageId: image.id },
              json: { roomId: room.id, sortOrder: index },
            }).then(async (response) => {
              if (!response.ok) {
                const payload = await response.json();
                throw new Error(extractApiMessage(payload, `Could not reorder ${image.fileName}.`));
              }
            }),
          ),
      );
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : 'Could not save the new image order.');
      void refreshProjectImages(projectId);
    }
  }

  async function handleDeleteRoom(room: RoomDraft) {
    if (!room.id || !projectId) {
      removeRoom(room.clientId);
      return;
    }

    setError('');
    setNotice('');

    const response = await api.api.projects[':id'].rooms[':roomId'].$delete({
      param: { id: projectId, roomId: room.id },
    });

    if (!response.ok) {
      const payload = await response.json();
      setError(extractApiMessage(payload, `Could not delete ${room.title}.`));
      return;
    }

    removeRoom(room.clientId);
    setNotice(`${room.title} removed from the draft.`);
  }

  async function handleDeleteImage(room: RoomDraft, imageId: string) {
    setError('');
    setNotice('');

    if (imageId.startsWith('local-preview-')) {
      removeImageFromRoom(room.clientId, imageId);
      return;
    }

    const currentProjectId = projectId;
    if (!currentProjectId) {
      removeImageFromRoom(room.clientId, imageId);
      return;
    }

    const removedImage = room.images.find((image) => image.id === imageId);
    removeImageFromRoom(room.clientId, imageId, false);

    try {
      const response = await api.api.projects[':id'].images[':imageId'].$delete({
        param: { id: currentProjectId, imageId },
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(extractApiMessage(payload, 'Could not remove this image.'));
      }

      setNotice('Image removed from the draft.');
      revokePreviewUrl(removedImage?.previewUrl);
      await refreshProjectImages(currentProjectId);
    } catch (deleteError) {
      if (removedImage) {
        updateRoom(room.clientId, (current) => ({
          ...current,
          images: [...current.images, removedImage].sort((left, right) => left.sortOrder - right.sortOrder),
        }));
      }
      setError(deleteError instanceof Error ? deleteError.message : 'Could not remove this image.');
    }
  }

  function addRoomFromTemplate(template: RoomTemplate) {
    const existingCount = rooms.filter((room) => room.roomSlug === template.slug).length;
    const nextTitle = template.allowMultiple
      ? template.alwaysNumber
        ? `${template.numberedPrefix ?? template.title} ${existingCount + 1}`
        : existingCount === 0
          ? template.title
          : `${template.numberedPrefix ?? template.title} ${existingCount + 1}`
      : template.title;

    setRooms((current) => [
      ...current,
      {
        ...makeRoomDraft({ roomSlug: template.slug, title: nextTitle }, current.length),
        clientId: `room-${current.length}-${template.slug}-${Date.now()}`,
        expanded: true,
      },
    ]);
  }

  function buildCreateProjectPayload() {
    if (!backendProjectSelection) {
      throw new Error(backendProjectSelectionError || 'Project type taxonomy is not ready. Please refresh and try again.');
    }

    return buildCreateProjectPayloadInput({
      projectName,
      selectedProjectTypeLabel,
      aboutProject,
      backendProjectSelection,
      selectedScopeSlug,
      primaryField: selectedProjectTypeBehavior.primaryField,
      bhkSlug,
      sizeSqft,
      citySlug,
      localitySlug: selectedLocality?.slug,
      localityLabel: selectedLocality?.label ?? locality,
      buildingName,
      budgetBandSlug,
      completedByMonth,
      projectDuration,
      projectType,
      selectedProjectSubtypeLabel,
      selectedScopes,
    });
  }

  function buildUpdateProjectPayload(): UpdateProjectInput {
    const createPayload = buildCreateProjectPayload();
    const fallbackCoverImageId = rooms.flatMap((room) => room.images).find((image) => !isLocalPreviewImage(image))?.id ?? null;

    return {
      title: createPayload.title,
      description: aboutProject.trim() || null,
      propertyTypeSlug: createPayload.propertyTypeSlug ?? null,
      propertySubtypeSlug: createPayload.propertySubtypeSlug ?? null,
      scopeSlug: createPayload.scopeSlug ?? null,
      bhkSlug: createPayload.bhkSlug ?? null,
      sizeSqft: createPayload.sizeSqft ?? null,
      citySlug: createPayload.citySlug ?? null,
      localitySlug: createPayload.localitySlug ?? null,
      buildingName: createPayload.buildingName ?? null,
      budgetBandSlug: createPayload.budgetBandSlug ?? null,
      completedMonth: createPayload.completedMonth ?? null,
      durationMonths: createPayload.durationMonths ?? null,
      coverImageId: coverImageId ?? fallbackCoverImageId,
      metadata: createPayload.metadata,
    };
  }

  async function ensureProject(): Promise<{ projectId: string; rooms: RoomDraft[] }> {
    if (projectId) return { projectId, rooms };
    if (ensureProjectPromiseRef.current) return ensureProjectPromiseRef.current;

    const promise = (async () => {
      const payload = buildCreateProjectPayload();

      const response = await api.api.projects.$post({ json: payload });
      const payloadJson = await response.json();

      if (!response.ok) {
        throw new Error(extractApiMessage(payloadJson, 'Could not create the draft project.'));
      }

      const detail = parseApiPayload(
        payloadJson,
        projectDetailResponseSchema,
        'Could not create the draft project.',
      );
      const attachedRooms = attachExistingProjectRoomsToDrafts(rooms, detail.rooms, roomTerms);
      setRooms(attachedRooms);
      setProjectId(detail.id);
      setLoadedProjectId(detail.id);
      router.replace(`/designer/projects/upload?projectId=${detail.id}`);
      return { projectId: detail.id, rooms: attachedRooms };
    })().finally(() => {
      ensureProjectPromiseRef.current = null;
    });

    ensureProjectPromiseRef.current = promise;
    return promise;
  }

  async function syncProject(currentProjectId: string) {
    const updatePayload = buildUpdateProjectPayload();

    const response = await api.api.projects[':id'].$patch({
      param: { id: currentProjectId },
      json: updatePayload,
    });
    const payloadJson = await response.json();

    if (!response.ok) {
      throw new Error(extractApiMessage(payloadJson, 'Could not save the draft project.'));
    }
  }

  async function syncRoomRecord(currentProjectId: string, room: RoomDraft, sortOrder: number) {
    const roomTypeId = room.roomTypeId || findRoomTypeId(roomTerms, room.roomSlug);

    if (!roomTypeId) {
      throw new Error(`Missing room type for ${room.title}.`);
    }

    const roomPayload: CreateProjectRoomInput | UpdateProjectRoomInput = {
      roomTypeId,
      name: room.title,
      description: room.description.trim() || undefined,
      sortOrder,
      metadata: mapRoomMetadata(room),
    };

    if (!room.id) {
      const response = await api.api.projects[':id'].rooms.$post({
        param: { id: currentProjectId },
        json: roomPayload as CreateProjectRoomInput,
      });
      const payloadJson = await response.json();

      if (!response.ok) {
        throw new Error(extractApiMessage(payloadJson, `Could not create ${room.title}.`));
      }

      const created = parseApiPayload(payloadJson, projectRoomSchema, `Could not create ${room.title}.`);
      updateRoom(room.clientId, (current) => ({ ...current, id: created.id, roomTypeId: created.roomTypeId }));
      return created.id;
    }

    const response = await api.api.projects[':id'].rooms[':roomId'].$patch({
      param: { id: currentProjectId, roomId: room.id },
      json: roomPayload,
    });
    const payloadJson = await response.json();

    if (!response.ok) {
      throw new Error(extractApiMessage(payloadJson, `Could not update ${room.title}.`));
    }

    updateRoom(room.clientId, (current) => ({ ...current, id: room.id, roomTypeId }));
    return room.id;
  }

  function buildImageMetadata(room: RoomDraft, roomId: string, sortOrder: number) {
    return buildImageMetadataInput({
      roomId,
      sortOrder,
      designStyle: room.designStyle,
      materialFinish: room.materialFinish,
      tags: room.tags,
    });
  }

  async function syncImageMetadata(room: RoomDraft, roomId: string) {
    for (const [index, image] of room.images.entries()) {
      if (isLocalPreviewImage(image)) continue;

      const metadataResponse = await api.api.media[':imageId'].metadata.$patch({
        param: { imageId: image.id },
        json: buildImageMetadata(room, roomId, index),
      });
      const metadataPayload = await metadataResponse.json();

      if (!metadataResponse.ok) {
        throw new Error(extractApiMessage(metadataPayload, `Could not update metadata for ${image.fileName}.`));
      }

      const updatedImage = parseApiPayload(
        metadataPayload,
        projectImageSchema,
        `Could not update metadata for ${image.fileName}.`,
      );
      updateRoom(room.clientId, (current) => ({
        ...current,
        images: current.images.map((currentImage) =>
          currentImage.id === updatedImage.id
            ? {
                ...currentImage,
                status: updatedImage.status,
                sortOrder: updatedImage.sortOrder,
                width: updatedImage.width,
                height: updatedImage.height,
              }
            : currentImage,
        ),
      }));
    }
  }

  async function fetchCompleteness(currentProjectId: string) {
    const response = await api.api.projects[':id'].completeness.$get({
      param: { id: currentProjectId },
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(extractApiMessage(payload, 'Could not check project completeness.'));
    }

    const nextCompletion = parseApiPayload(
      payload,
      projectCompletenessResponseSchema,
      'Could not check project completeness.',
    );
    setCompletion(nextCompletion);
    return nextCompletion;
  }

  function refreshUploadStateInBackground(currentProjectId: string) {
    void Promise.all([refreshProjectImages(currentProjectId), fetchCompleteness(currentProjectId)]).catch(
      (refreshError: unknown) => {
        setError(refreshError instanceof Error ? refreshError.message : 'Could not refresh image processing status.');
      },
    );
  }

  async function syncDraft() {
    const { projectId: currentProjectId, rooms: currentRooms } = await ensureProject();
    await syncProject(currentProjectId);

    for (const [index, room] of currentRooms.entries()) {
      const roomId = await syncRoomRecord(currentProjectId, room, index);
      await syncImageMetadata(room, roomId);
    }

    return currentProjectId;
  }

  async function saveDraft(showSavedNotice = true) {
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const currentProjectId = await syncDraft();
      await fetchCompleteness(currentProjectId);

      if (showSavedNotice) {
        setNotice('Draft saved.');
      }
      return currentProjectId;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this project draft.');
      requestAnimationFrame(() => {
        errorAlertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitProject() {
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const currentProjectId = await syncDraft();
      const projectCompleteness = await fetchCompleteness(currentProjectId);

      if (!projectCompleteness.complete) {
        const missingLabels = projectCompleteness.requirements
          .filter((requirement) => !requirement.complete)
          .map((requirement) => requirement.label);
        setError(
          missingLabels.length > 0
            ? `Project is not ready to submit yet. Missing: ${missingLabels.join(', ')}.`
            : 'Project is not ready to submit yet.',
        );
        requestAnimationFrame(() => {
          errorAlertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        return;
      }

      const response = await api.api.projects[':id'].submit.$post({
        param: { id: currentProjectId },
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(extractApiMessage(payload, 'Could not submit this project.'));
      }

      const submittedProject = parseApiPayload(
        payload,
        projectDetailResponseSchema,
        'Could not submit this project.',
      );
      setNotice(
        submittedProject.submittedAt
          ? 'Project submitted for review.'
          : 'Project submitted. Review status will update shortly.',
      );
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit this project.');
      requestAnimationFrame(() => {
        errorAlertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(room: RoomDraft, event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (files.length === 0) return;

    const previewBatchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pendingUploads: Array<{
      file: File;
      preview: ProjectImagePreview;
    }> = [];

    try {
      for (const [index, file] of files.entries()) {
        const contentTypeCheck = allowedImageContentType.safeParse(file.type);
        if (!contentTypeCheck.success) {
          throw new Error(`${file.name} is not a supported image type.`);
        }

        const previewUrl = URL.createObjectURL(file);
        previewUrlsRef.current.add(previewUrl);
        pendingUploads.push({
          file,
          preview: {
            id: `local-preview-${previewBatchId}-${index}`,
            status: 'processing',
            sortOrder: room.images.length + index,
            width: null,
            height: null,
            fileName: file.name,
            previewUrl,
          },
        });
      }
    } catch (previewError) {
      for (const upload of pendingUploads) {
        revokePreviewUrl(upload.preview.previewUrl);
      }
      updateRoom(room.clientId, (current) => ({
        ...current,
        uploadError: previewError instanceof Error ? previewError.message : 'Could not read selected files.',
      }));
      return;
    }

    updateRoom(room.clientId, (current) => ({
      ...current,
      uploading: true,
      uploadError: '',
      images: [...current.images, ...pendingUploads.map((upload) => upload.preview)],
    }));
    setError('');
    setNotice('');

    try {
      const { projectId: currentProjectId, rooms: currentRooms } = await ensureProject();
      const attachedRoom = currentRooms.find((item) => item.clientId === room.clientId) ?? room;
      const roomId = await syncRoomRecord(
        currentProjectId,
        attachedRoom,
        currentRooms.findIndex((item) => item.clientId === room.clientId),
      );

      for (const [index, upload] of pendingUploads.entries()) {
        const { file, preview } = upload;
        try {
          const uploadResponse = await api.api.media['upload-url'].$post({
            json: {
              projectId: currentProjectId,
              contentType: file.type as AllowedImageContentType,
              size: file.size,
            },
          });
          const uploadPayload = await uploadResponse.json();

          if (!uploadResponse.ok) {
            throw new Error(extractApiMessage(uploadPayload, `Could not prepare upload for ${file.name}.`));
          }

          const uploaded = parseApiPayload(
            uploadPayload,
            uploadUrlResponseSchema,
            `Could not prepare upload for ${file.name}.`,
          );

          const storageResponse = await fetch(uploaded.uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': file.type,
            },
            body: file,
          });

          if (!storageResponse.ok) {
            throw new Error(`Could not upload ${file.name}.`);
          }

          const commitResponse = await api.api.media[':imageId'].commit.$post({
            param: { imageId: uploaded.imageId },
          });
          if (!commitResponse.ok) {
            const commitPayload = await commitResponse.json();
            throw new Error(extractApiMessage(commitPayload, `Could not commit ${file.name}.`));
          }

          const sortOrder = room.images.length + index;
          const linkResponse = await api.api.projects[':id'].images[':imageId'].$patch({
            param: { id: currentProjectId, imageId: uploaded.imageId },
            json: { roomId, sortOrder },
          });
          const linkedPayload = await linkResponse.json();

          if (!linkResponse.ok) {
            throw new Error(extractApiMessage(linkedPayload, `Could not attach ${file.name} to ${room.title}.`));
          }

          const linkedImage = parseApiPayload(
            linkedPayload,
            projectImageAttachmentSchema,
            `Could not attach ${file.name} to ${room.title}.`,
          );
          const metadataResponse = await api.api.media[':imageId'].metadata.$patch({
            param: { imageId: linkedImage.id },
            json: buildImageMetadata(room, roomId, sortOrder),
          });
          const metadataPayload = await metadataResponse.json();

          if (!metadataResponse.ok) {
            throw new Error(extractApiMessage(metadataPayload, `Could not tag ${file.name}.`));
          }

          const updatedImage = parseApiPayload(
            metadataPayload,
            projectImageSchema,
            `Could not tag ${file.name}.`,
          );
          setCoverImageId((current) => current ?? linkedImage.id);

          updateRoom(room.clientId, (current) => ({
            ...current,
            id: roomId,
            images: current.images.map((currentImage) =>
              currentImage.id === preview.id
                ? {
                id: linkedImage.id,
                status: updatedImage.status,
                sortOrder: updatedImage.sortOrder,
                width: updatedImage.width,
                height: updatedImage.height,
                fileName: file.name,
                    previewUrl: preview.previewUrl,
                  }
                : currentImage,
            ),
          }));
        } catch (fileUploadError) {
          updateRoom(room.clientId, (current) => ({
            ...current,
            images: current.images.map((currentImage) =>
              currentImage.id === preview.id ? { ...currentImage, status: 'failed' } : currentImage,
            ),
          }));
          throw fileUploadError;
        }
      }

      refreshUploadStateInBackground(currentProjectId);
      setNotice('Images uploaded and linked to the draft. Processing will continue in the background.');
    } catch (uploadError) {
      updateRoom(room.clientId, (current) => ({
        ...current,
        uploadError: uploadError instanceof Error ? uploadError.message : 'Could not upload images.',
      }));
    } finally {
      updateRoom(room.clientId, (current) => ({ ...current, uploading: false }));
    }
  }

  const cityOptions = cities.map((term) => ({ value: term.slug, label: term.label }));
  const bhkSelectOptions = bhkOptions.map((term) => ({ value: term.slug, label: term.label }));
  const localityOptions = localities.map((term) => ({ value: term.slug, label: term.label }));
  const styleOptions = themeTerms.map((term) => ({ value: term.slug, label: term.label }));
  const finishOptions = finishTerms.map((term) => ({ value: term.slug, label: term.label }));
  const roomAddOptions = suggestedRooms.filter((template) => {
    if (template.allowMultiple) return true;
    return !rooms.some((room) => room.title === template.title || room.roomSlug === template.slug);
  });
  const availableRoomTemplates = useMemo(() => {
    const templatesBySlug = new Map<string, RoomTemplate>();

    for (const template of suggestedRooms) {
      templatesBySlug.set(template.slug, template);
    }

    return Array.from(templatesBySlug.values()).filter((template) => {
      if (template.allowMultiple) return true;
      return !rooms.some((room) => room.title === template.title || room.roomSlug === template.slug);
    });
  }, [rooms, suggestedRooms]);
  const normalizedRoomSearchQuery = useMemo(() => normalizeRoomSearchValue(roomSearchQuery), [roomSearchQuery]);
  const roomSearchResults = useMemo(() => {
    const matchesQuery = (template: RoomTemplate) => {
      if (!normalizedRoomSearchQuery) return true;

      const normalizedTitle = normalizeRoomSearchValue(template.title);
      const normalizedSlug = template.slug.replaceAll('-', ' ').toLowerCase();
      return normalizedTitle.includes(normalizedRoomSearchQuery) || normalizedSlug.includes(normalizedRoomSearchQuery);
    };

    return availableRoomTemplates
      .filter(matchesQuery)
      .sort((left, right) => {
        const leftSuggested = roomAddOptions.some((template) => template.slug === left.slug);
        const rightSuggested = roomAddOptions.some((template) => template.slug === right.slug);

        if (leftSuggested !== rightSuggested) {
          return leftSuggested ? -1 : 1;
        }

        const leftStartsWith = normalizeRoomSearchValue(left.title).startsWith(normalizedRoomSearchQuery);
        const rightStartsWith = normalizeRoomSearchValue(right.title).startsWith(normalizedRoomSearchQuery);

        if (leftStartsWith !== rightStartsWith) {
          return leftStartsWith ? -1 : 1;
        }

        return left.title.localeCompare(right.title);
      });
  }, [availableRoomTemplates, normalizedRoomSearchQuery, roomAddOptions]);
  const exactRoomSearchMatch = useMemo(
    () =>
      availableRoomTemplates.find((template) => {
        const normalizedTitle = normalizeRoomSearchValue(template.title);
        const normalizedSlug = template.slug.replaceAll('-', ' ').toLowerCase();
        return normalizedTitle === normalizedRoomSearchQuery || normalizedSlug === normalizedRoomSearchQuery;
      }) ?? null,
    [availableRoomTemplates, normalizedRoomSearchQuery],
  );

  function closeRoomSearch() {
    setRoomSearchOpen(false);
    setRoomSearchQuery('');
  }

  function handleRoomSearchSelect(template: RoomTemplate) {
    addRoomFromTemplate(template);
    setSections((current) => ({ ...current, images: true }));
    setNotice(`${template.title} added to this project.`);
    setError('');
    closeRoomSearch();
  }

  function handleCreateRoomType() {
    if (!normalizedRoomSearchQuery) return;

    if (exactRoomSearchMatch) {
      handleRoomSearchSelect(exactRoomSearchMatch);
      return;
    }

    setError('Custom room types are not taxonomy-backed yet. Pick one of the room types above.');
  }

  return (
    <div className="px-6 py-6 md:px-8 md:py-8 xl:px-10 xl:py-10">
      <div>
        <h1 className={cn(typography.pageTitle, 'text-foreground')}>Upload project</h1>
        <p className={cn(typography.pageSubtitle, 'mt-2 text-muted-foreground')}>Let&apos;s get your profile ready to go live.</p>
      </div>

      {taxonomyError ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load form options</AlertTitle>
          <AlertDescription>{taxonomyError}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert ref={errorAlertRef} variant="destructive" className="mt-6">
          <AlertCircle className="size-4" />
          <AlertTitle>Something needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {notice ? (
        <div className="fixed top-4 right-4 z-50 w-[min(calc(100vw-2rem),22rem)]">
          <Alert variant="success" className="shadow-lg">
            <Check className="size-4" />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {loadingProject ? (
        <Alert className="mt-6">
          <Loader2 className="size-4 animate-spin" />
          <AlertDescription>Loading saved draft…</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,50.3125rem)_19.8125rem]">
        <div className="space-y-4">
          <SectionFrame
            step="Step 1"
            title="Project classification"
            open={sections.classification}
            onToggle={() => toggleSection('classification')}
          >
            <div className="space-y-0">
              <div className="px-5 pt-5 pb-4 sm:px-6">
                <div className={cn(typography.label, 'text-foreground')}>Project type</div>
                <div className="relative mt-4">
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {projectTypeOptions.map((option) => (
                      <ProjectTypeCard
                        key={option.slug}
                        option={option}
                        selected={projectType === option.slug}
                        onSelect={() => handleProjectTypeSelect(option.slug)}
                      />
                    ))}
                  </div>
                  <div className="pointer-events-none absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-background to-transparent" />
                </div>
              </div>

              <Divider />

              <div className="px-5 py-5 sm:px-6">
                <h3 className={cn(typography.subsectionTitle, 'text-foreground')}>
                  {selectedProjectTypeBehavior.detailsTitle}
                </h3>
                <p className={cn(typography.bodySmall, 'mt-1 text-muted-foreground')}>
                  {selectedProjectTypeBehavior.detailsSubtitle}
                </p>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  {selectedProjectTypeBehavior.primaryField === 'bhk' ? (
                    <FormSelect
                      label={selectedProjectTypeBehavior.primaryLabel}
                      value={bhkSlug}
                      onChange={setBhkSlug}
                      options={bhkSelectOptions}
                      placeholder={loadingTaxonomy ? 'Loading…' : selectedProjectTypeBehavior.primaryPlaceholder}
                    />
                  ) : (
                    <FormSelect
                      label={selectedProjectTypeBehavior.primaryLabel}
                      value={projectSubtype}
                      onChange={setProjectSubtype}
                      options={detailSubtypeOptions}
                      placeholder={selectedProjectTypeBehavior.primaryPlaceholder}
                    />
                  )}
                  <FormField
                    label="Size (sq.ft)"
                    value={sizeSqft}
                    onChange={setSizeSqft}
                    placeholder="e.g. 1450"
                    type="number"
                  />
                </div>
              </div>

              <Divider />

              <div className="px-5 py-5 sm:px-6">
                <h3 className={cn(typography.subsectionTitle, 'text-foreground')}>Location</h3>
                <p className={cn(typography.bodySmall, 'mt-1 text-muted-foreground')}>Where is this project located?</p>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <FormSelect
                    label="City"
                    value={citySlug}
                    onChange={(value) => {
                      setCitySlug(value);
                      setLocality('');
                    }}
                    options={cityOptions}
                    placeholder={loadingTaxonomy ? 'Loading…' : 'Select city'}
                  />
                  <div className="space-y-1.5">
                    <Label className={cn(typography.label, 'text-foreground')}>Locality / Area</Label>
                    {localityOptions.length > 0 ? (
                      <div className="relative">
                        <select
                          value={locality}
                          onChange={(event) => setLocality(event.target.value)}
                          className={cn(
                            'flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-9 shadow-xs transition-colors',
                            typography.control,
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                            !locality && 'text-muted-foreground',
                          )}
                        >
                          <option value="">e.g. Adyar, Koramangala</option>
                          {localityOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    ) : (
                      <Input
                        value={locality}
                        onChange={(event) => setLocality(event.target.value)}
                        placeholder="e.g. Adyar, Koramangala"
                        className={typography.control}
                      />
                    )}
                  </div>
                </div>
                {selectedProjectTypeBehavior.buildingNameLabel ? (
                  <div className="mt-5 max-w-[22.8125rem]">
                    <FormField
                      label={selectedProjectTypeBehavior.buildingNameLabel}
                      value={buildingName}
                      onChange={setBuildingName}
                      placeholder="e.g. Prestige Lakeside"
                    />
                  </div>
                ) : null}
              </div>

              <Divider />

              <div className="px-5 py-5 sm:px-6">
                <h3 className={cn(typography.subsectionTitle, 'text-foreground')}>Project scope</h3>
                <p className={cn(typography.bodySmall, 'mt-1 text-muted-foreground')}>What did you deliver on this project?</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  {scopeOptions.map((scope) => (
                    <ScopeChip
                      key={scope.value}
                      active={selectedScopes.includes(scope.value)}
                      label={scope.label}
                      onClick={() => toggleScope(scope.value)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </SectionFrame>

          <SectionFrame
            step="Step 2"
            title="Timeline & Cost"
            open={sections.timeline}
            onToggle={() => toggleSection('timeline')}
          >
            <div className="space-y-0">
              <div className="px-5 py-5 sm:px-6">
                <div className="grid gap-5 md:grid-cols-2">
                  <FormField
                    label="Project completed by"
                    value={completedByMonth}
                    onChange={setCompletedByMonth}
                    type="month"
                    placeholder="YYYY-MM"
                    helperText="Use YYYY-MM, for example 2026-03."
                  />
                  <FormSelect
                    label="Project duration"
                    value={projectDuration}
                    onChange={setProjectDuration}
                    options={fallbackDurationOptions.map((option) => ({ value: option, label: option }))}
                    placeholder="e.g. 4 months"
                  />
                </div>
              </div>

              <Divider />

              <div className="px-5 py-5 sm:px-6">
                <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_14.5rem]">
                  <div>
                    <h3 className={cn(typography.subsectionTitle, 'text-foreground')}>Project budget</h3>
                    <p className={cn(typography.bodySmall, 'mt-1 text-muted-foreground')}>What did you deliver on this project?</p>
                  </div>
                  <FormSelect
                    label="Cost range"
                    value={budgetBandSlug}
                    onChange={setBudgetBandSlug}
                    options={budgetOptions}
                    placeholder="Select"
                  />
                </div>
                <div className={cn('mt-5 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-primary', typography.bodyMedium)}>
                  Project with a cost range get 3× more enquiries
                </div>
              </div>
            </div>
          </SectionFrame>

          <SectionFrame
            step="Step 3"
            title="Project metadata"
            open={sections.metadata}
            onToggle={() => toggleSection('metadata')}
          >
            <div className="space-y-0 px-5 py-5 sm:px-6">
              <div className="space-y-5">
                <FormField
                  label="Project name"
                  value={projectName}
                  onChange={setProjectName}
                  placeholder="Maitri Apartments - 2BHK luxury in Bangalore"
                />
                <div className="space-y-1.5">
                  <Label className={cn(typography.label, 'text-foreground')}>About the project</Label>
                  <Textarea
                    value={aboutProject}
                    onChange={(event) => setAboutProject(event.target.value)}
                    placeholder="Optional"
                    className={cn('min-h-32 resize-y', typography.control)}
                  />
                </div>
              </div>
            </div>
          </SectionFrame>

          <SectionFrame
            step="Step 4"
            title="Project images"
            open={sections.images}
            onToggle={() => toggleSection('images')}
          >
            <div className="space-y-4 px-5 py-5 sm:px-6">
              {rooms.map((room) => (
                <RoomCard
                  key={room.clientId}
                  room={room}
                  styleOptions={styleOptions}
                  finishOptions={finishOptions}
                  onToggle={() => updateRoom(room.clientId, (current) => ({ ...current, expanded: !current.expanded }))}
                  onDelete={() => void handleDeleteRoom(room)}
                  onDescriptionChange={(value) => updateRoom(room.clientId, (current) => ({ ...current, description: value }))}
                  onDesignStyleChange={(value) => updateRoom(room.clientId, (current) => ({ ...current, designStyle: value }))}
                  onMaterialFinishChange={(value) => updateRoom(room.clientId, (current) => ({ ...current, materialFinish: value }))}
                  onTagInputChange={(value) => updateRoom(room.clientId, (current) => ({ ...current, tagInput: value }))}
                  onAddTag={(tag) =>
                    updateRoom(room.clientId, (current) => ({
                      ...current,
                      tags: current.tags.includes(tag) ? current.tags : [...current.tags, tag],
                      tagInput: '',
                    }))
                  }
                  onRemoveTag={(tag) =>
                    updateRoom(room.clientId, (current) => ({
                      ...current,
                      tags: current.tags.filter((item) => item !== tag),
                    }))
                  }
                  onUpload={(event) => void handleUpload(room, event)}
                  onSetCover={handleSetCover}
                  onMoveImage={(imageId, direction) => void handleMoveImage(room, imageId, direction)}
                  onRemoveImage={(imageId) => void handleDeleteImage(room, imageId)}
                  coverImageId={coverImageId}
                  allowDelete={rooms.length > defaultRoomCount}
                />
              ))}

              <button
                type="button"
                onClick={() => setRoomSearchOpen(true)}
                className="group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border border-dashed border-border/80 bg-background px-4 py-3 text-left transition-colors hover:border-primary/40"
              >
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent,hsl(var(--primary)/0.08),transparent)] bg-[length:200%_100%] animate-pulse" />
                <div className={cn('relative flex items-center gap-2 text-muted-foreground', typography.subsectionTitle)}>
                  <Plus className="size-4 text-primary" />
                  Add new room type
                </div>
                <div className={cn('relative text-muted-foreground transition-colors group-hover:text-foreground', typography.bodySmall)}>
                  Search room taxonomy
                </div>
              </button>
            </div>
          </SectionFrame>

          <div className="sticky bottom-0 z-10 border border-border/80 bg-background/95 px-4 py-3 shadow-sm backdrop-blur sm:rounded-2xl sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void saveDraft().catch((saveError: unknown) => {
                    setError(saveError instanceof Error ? saveError.message : 'Could not save this project draft.');
                  });
                }}
                disabled={saving || loadingProject}
                className="text-sm leading-none font-semibold"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Save as draft
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  await handleSubmitProject();
                }}
                disabled={saving || loadingProject}
                className="text-sm leading-[1.6] font-medium"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Preview &amp; Submit Project
              </Button>
            </div>
          </div>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-8 xl:self-start">
          <TipsCard />
          <ChecklistCard
            title="Required information"
            icon={<Clock3 className="size-3.5" />}
            items={requiredChecklist}
          />
          <WhyItMattersCard />
        </aside>
      </div>

      <Dialog
        open={roomSearchOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeRoomSearch();
            return;
          }

          setRoomSearchOpen(true);
        }}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-background/35 backdrop-blur-[6px]"
          className="gap-0 overflow-hidden border border-border/80 bg-background p-0 shadow-2xl sm:max-w-[40rem]"
        >
          <DialogTitle className="sr-only">Add new room type</DialogTitle>
          <DialogDescription className="sr-only">
            Search the available room taxonomy and add another room to this project.
          </DialogDescription>

          <div className="border-b border-border/80">
            <div className="flex h-[51px] items-center gap-2 px-3">
              <Search className="size-5 text-muted-foreground" />
              <Input
                autoFocus
                value={roomSearchQuery}
                onChange={(event) => setRoomSearchQuery(event.target.value)}
                placeholder="Search room types"
                className={cn('h-auto border-none bg-transparent px-0 py-0 shadow-none focus-visible:ring-0', typography.control)}
              />
            </div>
          </div>

          <div className="bg-background/95 px-2 pb-2 pt-1">
            <div className="max-h-[16.625rem] overflow-y-auto">
              <div className="flex h-[38px] items-center rounded-md px-2">
                <span className={cn(typography.monoEyebrow, 'text-muted-foreground')}>
                  Search results
                </span>
              </div>

              {roomSearchResults.length > 0 ? (
                roomSearchResults.map((template) => (
                  <button
                    key={`${template.slug}-${template.title}`}
                    type="button"
                    onClick={() => handleRoomSearchSelect(template)}
                    className="flex h-[38px] w-full items-center rounded-md px-2 text-left transition-colors hover:bg-muted/70"
                  >
                    <div className={cn('flex items-center gap-2 text-foreground', typography.navText)}>
                      <ArrowRight className="size-4 text-muted-foreground" />
                      <span>{template.title}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className={cn('px-2 py-6 text-muted-foreground', typography.bodyMedium)}>
                  No matching taxonomy-backed room type found.
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleCreateRoomType}
              disabled={!normalizedRoomSearchQuery}
              className={cn(
                'mt-2 flex h-[38px] w-full items-center gap-2 rounded-md px-2 text-left transition-colors',
                normalizedRoomSearchQuery
                  ? 'bg-muted/80 text-foreground hover:bg-muted'
                  : 'bg-muted/40 text-muted-foreground/70',
              )}
            >
              <Plus className="size-4" />
              <span className={typography.navText}>
                {normalizedRoomSearchQuery
                  ? `Create new room type “${roomSearchQuery.trim()}”`
                  : 'Create new room type'}
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
