'use client';

import type { ChangeEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertCircle,
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
  Trash2,
} from 'lucide-react';
import {
  allowedImageContentType,
  type AllowedImageContentType,
  type CreateProjectInput,
  type CreateProjectRoomInput,
  type ProjectCompletenessResponse,
  type ProjectDetailResponse,
  type ProjectImageAttachment,
  type ProjectImageDto,
  type ProjectRoom,
  type TaxonomyTerm,
  type UpdateProjectInput,
  type UpdateImageMetadataInput,
  type UploadUrlResponse,
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

const projectTypeBackendMap: Record<string, { propertyTypeSlug: string; propertySubtypeSlug?: string }> = {
  apartment: { propertyTypeSlug: 'residential', propertySubtypeSlug: 'apartment' },
  villa: { propertyTypeSlug: 'residential', propertySubtypeSlug: 'villa' },
  'office-commercial': { propertyTypeSlug: 'commercial-workspace', propertySubtypeSlug: 'corporate-office' },
  'institutional-public': { propertyTypeSlug: 'institutional-public' },
  'retail-showroom': { propertyTypeSlug: 'retail-showroom', propertySubtypeSlug: 'showroom' },
  'cafe-restaurant': { propertyTypeSlug: 'food-hospitality', propertySubtypeSlug: 'cafe-coffee-shop' },
};

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
    { slug: 'modular-kitchen', title: 'Kitchen' },
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
      { slug: 'modular-kitchen', title: 'Kitchen' },
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
      { slug: 'modular-kitchen', title: 'Kitchen' },
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

function slugifyTitle(input: string) {
  return input.trim() || 'Untitled project draft';
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
  const aliasMap: Record<string, string[]> = {
    'modular-kitchen': ['modular-kitchen', 'kitchen'],
    kitchen: ['kitchen', 'modular-kitchen'],
    'dining-area': ['dining-area', 'dining'],
    'restaurant-dining': ['restaurant-dining', 'dining'],
    'guest-room': ['guest-room', 'guest-bedroom'],
    'workstation-open-seating-area': ['workstation-open-seating', 'workstation-open-seating-area'],
    'breakout-lounge-area': ['breakout-lounge', 'breakout-lounge-area'],
  };
  const alias = aliasMap[slug] ?? [slug];
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
    return payload.error.message;
  }
  return fallback;
}

function normalizeRoomSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueNonEmpty(values: string[]) {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function isLocalPreviewImage(image: ProjectImagePreview) {
  return image.id.startsWith('local-preview-');
}

function parsePositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseDurationMonths(value: string) {
  const match = /^(\d+)/.exec(value.trim());
  if (!match) return undefined;
  return parsePositiveInteger(match[1]!);
}

function getBackendProjectSelection(
  projectType: string,
  projectSubtype: string,
  availablePropertyTypeSlugs: Set<string>,
  availablePropertySubtypeSlugs: Set<string>,
) {
  const base = projectTypeBackendMap[projectType] ?? projectTypeBackendMap.apartment!;
  const hasLoadedPropertyTypes = availablePropertyTypeSlugs.size > 0;
  const hasLoadedPropertySubtypes = availablePropertySubtypeSlugs.size > 0;
  const propertyTypeSlug = base.propertyTypeSlug;

  if (hasLoadedPropertyTypes && !availablePropertyTypeSlugs.has(propertyTypeSlug)) {
    throw new Error(`Project type taxonomy is missing "${propertyTypeSlug}". Please refresh seed data and try again.`);
  }

  const mappedSubtypeSlug = (base.propertySubtypeSlug ?? projectSubtype) || undefined;

  if (mappedSubtypeSlug && hasLoadedPropertySubtypes && !availablePropertySubtypeSlugs.has(mappedSubtypeSlug)) {
    throw new Error(`Project subtype taxonomy is missing "${mappedSubtypeSlug}". Please refresh seed data and try again.`);
  }

  return {
    propertyTypeSlug,
    propertySubtypeSlug: mappedSubtypeSlug,
  };
}

function mapProjectMetadata(input: {
  uiProjectTypeSlug: string;
  projectSubtypeSlug: string;
  projectSubtypeLabel: string;
  localityLabel: string;
  scopes: string[];
}) {
  return {
    uiProjectTypeSlug: input.uiProjectTypeSlug || undefined,
    projectSubtypeLabel: input.projectSubtypeLabel || undefined,
    projectSubtypeSlug: input.projectSubtypeSlug || undefined,
    localityLabel: input.localityLabel || undefined,
    scopeSlugs: input.scopes,
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
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: 'text' | 'number' | 'month';
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
            'flex w-full items-start justify-between gap-4 px-5 text-left sm:px-6',
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

        {open ? (
          <CardContent className="p-0">
            <Divider />
            {children}
          </CardContent>
        ) : null}
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
          ? 'border-primary bg-primary/5 text-primary shadow-[0_8px_20px_rgba(15,23,42,0.08),0_0_0_1px_hsl(var(--primary)/0.22)]'
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

      {room.expanded ? (
        <>
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
              <div className="flex flex-wrap gap-1.5">
                {room.images.map((image) => {
                  const statusLabel =
                    image.status === 'ready' ? 'Ready' : image.status === 'processing' ? 'Processing' : 'Failed';

                  return (
                    <div
                      key={image.id}
                      className="relative h-10 w-13 overflow-hidden rounded-sm border border-border bg-muted"
                      title={`${image.fileName} · ${statusLabel}`}
                    >
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
        </>
      ) : null}
    </div>
  );
}

export function DesignerProjectUpload() {
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
  const backendProjectSelection = useMemo(
    () =>
      getBackendProjectSelection(
        projectType,
        projectSubtype,
        availablePropertyTypeSlugs,
        availablePropertySubtypeSlugs,
      ),
    [availablePropertySubtypeSlugs, availablePropertyTypeSlugs, projectSubtype, projectType],
  );
  const selectedLocality = useMemo(
    () => localities.find((term) => term.slug === locality) ?? null,
    [localities, locality],
  );
  const selectedScopeSlug = selectedScopes[0] ?? '';

  const totalImages = useMemo(
    () => rooms.reduce((count, room) => count + room.images.length, 0),
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
    return payload.terms as TaxonomyTerm[];
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
    const roomsArePristine = rooms.every(
      (room) =>
        !room.id &&
        room.description.length === 0 &&
        room.designStyle.length === 0 &&
        room.materialFinish.length === 0 &&
        room.tags.length === 0 &&
        room.tagInput.length === 0 &&
        room.images.length === 0 &&
        !room.uploading &&
        room.uploadError.length === 0,
    );

    if (!roomsArePristine) return;

    const nextDefaultRooms = buildDefaultRooms(projectType, bhkSlug).map((seed, index) =>
      makeRoomDraft({ roomSlug: seed.slug, title: seed.title }, index),
    );
    const currentSignature = rooms.map((room) => `${room.roomSlug}:${room.title}`).join('|');
    const nextSignature = nextDefaultRooms.map((room) => `${room.roomSlug}:${room.title}`).join('|');

    if (currentSignature !== nextSignature) {
      setRooms(nextDefaultRooms);
    }
  }, [bhkSlug, projectType, rooms]);

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

  function revokePreviewUrl(previewUrl?: string) {
    if (!previewUrl) return;
    URL.revokeObjectURL(previewUrl);
    previewUrlsRef.current.delete(previewUrl);
  }

  function removeRoom(clientId: string) {
    setRooms((current) => {
      const removedRoom = current.find((room) => room.clientId === clientId);
      removedRoom?.images.forEach((image) => revokePreviewUrl(image.previewUrl));
      return current.filter((room) => room.clientId !== clientId);
    });
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

  function buildCreateProjectPayload(): CreateProjectInput {
    const parsedSizeSqft = parsePositiveInteger(sizeSqft);
    const parsedDurationMonths = parseDurationMonths(projectDuration);

    return {
      title: slugifyTitle(projectName || `${selectedProjectTypeLabel} project`),
      description: aboutProject.trim() || undefined,
      propertyTypeSlug: backendProjectSelection.propertyTypeSlug,
      propertySubtypeSlug: backendProjectSelection.propertySubtypeSlug,
      scopeSlug: selectedScopeSlug || undefined,
      bhkSlug: selectedProjectTypeBehavior.primaryField === 'bhk' ? bhkSlug || undefined : undefined,
      sizeSqft: parsedSizeSqft,
      citySlug: citySlug || undefined,
      localitySlug: selectedLocality?.slug,
      buildingName: buildingName.trim() || undefined,
      budgetBandSlug: budgetBandSlug || undefined,
      completedMonth: completedByMonth || undefined,
      durationMonths: parsedDurationMonths,
      metadata: mapProjectMetadata({
        uiProjectTypeSlug: projectType,
        projectSubtypeSlug: backendProjectSelection.propertySubtypeSlug ?? '',
        projectSubtypeLabel: selectedProjectSubtypeLabel,
        localityLabel: selectedLocality?.label ?? locality,
        scopes: selectedScopes,
      }),
    };
  }

  function buildUpdateProjectPayload(): UpdateProjectInput {
    const createPayload = buildCreateProjectPayload();
    const coverImageId = rooms.flatMap((room) => room.images).find((image) => !isLocalPreviewImage(image))?.id ?? null;

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
      coverImageId,
      metadata: createPayload.metadata,
    };
  }

  async function ensureProject(): Promise<string> {
    if (projectId) return projectId;

    const payload = buildCreateProjectPayload();

    const response = await api.api.projects.$post({ json: payload });
    const payloadJson = await response.json();

    if (!response.ok) {
      throw new Error(extractApiMessage(payloadJson, 'Could not create the draft project.'));
    }

    const detail = payloadJson as ProjectDetailResponse;
    setProjectId(detail.id);
    return detail.id;
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

      const created = payloadJson as ProjectRoom;
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

    return room.id;
  }

  function buildImageMetadata(room: RoomDraft, roomId: string, sortOrder: number): UpdateImageMetadataInput {
    return {
      roomId,
      sortOrder,
      themeSlugs: room.designStyle ? [room.designStyle] : [],
      finishSlugs: room.materialFinish ? [room.materialFinish] : [],
      tagSlugs: uniqueNonEmpty(room.tags.map(toSlug)),
    };
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

      const updatedImage = metadataPayload as ProjectImageDto;
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

    const nextCompletion = payload as ProjectCompletenessResponse;
    setCompletion(nextCompletion);
    return nextCompletion;
  }

  async function syncDraft() {
    const currentProjectId = await ensureProject();
    await syncProject(currentProjectId);

    for (const [index, room] of rooms.entries()) {
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
      throw saveError;
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
        return;
      }

      const response = await api.api.projects[':id'].submit.$post({
        param: { id: currentProjectId },
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(extractApiMessage(payload, 'Could not submit this project.'));
      }

      const submittedProject = payload as ProjectDetailResponse;
      setNotice(
        submittedProject.submittedAt
          ? 'Project submitted for review.'
          : 'Project submitted. Review status will update shortly.',
      );
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit this project.');
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
      const currentProjectId = await ensureProject();
      const roomId = await syncRoomRecord(currentProjectId, room, rooms.findIndex((item) => item.clientId === room.clientId));

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

          const uploaded = uploadPayload as UploadUrlResponse;

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

          const linkedImage = linkedPayload as ProjectImageAttachment;
          const metadataResponse = await api.api.media[':imageId'].metadata.$patch({
            param: { imageId: linkedImage.id },
            json: buildImageMetadata(room, roomId, sortOrder),
          });
          const metadataPayload = await metadataResponse.json();

          if (!metadataResponse.ok) {
            throw new Error(extractApiMessage(metadataPayload, `Could not tag ${file.name}.`));
          }

          const updatedImage = metadataPayload as ProjectImageDto;

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

      setNotice('Images uploaded and linked to the draft.');
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
        <Alert variant="destructive" className="mt-6">
          <AlertCircle className="size-4" />
          <AlertTitle>Something needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {notice ? (
        <Alert className="mt-6 border-primary/20 bg-primary/5 text-primary">
          <Check className="size-4" />
          <AlertDescription>{notice}</AlertDescription>
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
                    placeholder="March 2026"
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
                  allowDelete={rooms.length > defaultRoomCount}
                />
              ))}

              <button
                type="button"
                onClick={() => setRoomSearchOpen(true)}
                className="group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border border-dashed border-border/80 bg-background px-4 py-3 text-left transition-colors hover:border-primary/40"
              >
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(16,185,129,0.08),transparent)] bg-[length:200%_100%] animate-pulse" />
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

          <div className="sticky bottom-0 z-10 border border-border/80 bg-background/95 px-4 py-3 shadow-sm backdrop-blur sm:rounded-2xl sm:px-5 xl:w-[calc(100%+19.8125rem+1.5rem)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => void saveDraft()}
                disabled={saving}
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
                disabled={saving}
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
