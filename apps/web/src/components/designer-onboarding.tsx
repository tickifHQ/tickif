'use client';

import type { FormEvent, ReactNode } from 'react';
import { useEffect, useId, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { BriefcaseBusiness, ChevronRight, ChevronsUpDown, Loader2, UserRound } from 'lucide-react';
import {
  onboardDesignerSchema,
  type ListTaxonomyResponse,
  type OnboardDesignerInput,
  type OnboardDesignerResponse,
  type TaxonomyTerm,
} from '@repo/contracts';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { cn } from '@repo/ui/lib/utils';
import { authClient } from '@/lib/auth-client';
import { api } from '@/lib/api';
import { InstagramBrandIcon, LinkedInBrandIcon, YouTubeBrandIcon } from '@/components/brand-icons';
import { InitialsAvatar } from '@/components/initials-avatar';
import { PhoneNumberInput, countries, toE164PhoneNumber } from '@/components/phone-number-input';

type EntityType = OnboardDesignerInput['entityType'];

type SubmitOnboarding = (
  input: OnboardDesignerInput,
) => Promise<{ data: OnboardDesignerResponse; created: boolean }>;

type DesignerOnboardingProps = {
  signedInName?: string | null;
  signedInAs?: string | null;
  onSubmitOnboarding?: SubmitOnboarding;
};

const entityOptions: Array<{
  value: EntityType;
  title: string;
  description: string;
  illustration: string;
  icon: typeof UserRound;
  descriptionClassName?: string;
}> = [
  {
    value: 'individual',
    title: 'Just me',
    description: 'Solo designer or personal brand.',
    illustration: '/illustrations/onboarding-workspace-desk.svg',
    icon: UserRound,
  },
  {
    value: 'company',
    title: 'Interior company (firm)',
    description: 'An Interior design firm or corporate with a team.',
    illustration: '/illustrations/onboarding-profile-chair.svg',
    icon: BriefcaseBusiness,
    descriptionClassName: 'max-w-52',
  },
];

const onboardingIllustrations = {
  panel: '/illustrations/onboarding-living-room.svg',
} as const;

type OnboardingStep = 'entity' | 'details' | 'presence' | 'services';
type TaxonomyKind = 'scope' | 'theme';
type TaxonomyOptions = Record<TaxonomyKind, TaxonomyTerm[]>;

const firmTypeOptions = [
  'Private Limited',
  'LLP',
  'Partnership',
  'Proprietorship',
  'Studio',
] as const;

const foundedOptions = [
  '2026',
  '2025',
  '2024',
  '2023',
  '2022',
  '2021',
  '2020',
  '2019',
  '2018',
] as const;

const teamSizeOptions = ['Just me', '2-10', '11-25', '26-50', '50+'] as const;

const emptyTaxonomyOptions: TaxonomyOptions = {
  scope: [],
  theme: [],
};

function optionalTrimmed(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

function validateOptionalUrl(
  value: string,
  schema: { safeParse: (value: unknown) => { success: boolean } },
  message: string,
) {
  const normalized = normalizeUrl(value);
  if (!normalized) return '';
  if (!schema.safeParse(normalized).success) return message;

  try {
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();
    const hasPublicHostname =
      hostname.includes('.') && !hostname.startsWith('.') && !hostname.endsWith('.');
    return hasPublicHostname ? '' : message;
  } catch {
    return message;
  }
}

const websiteUrlValidationMessage = 'Enter a valid website URL.';
const googleBusinessUrlValidationMessage = 'Enter a valid Google Business URL.';

function validateWebsiteUrl(value: string) {
  return validateOptionalUrl(
    value,
    onboardDesignerSchema.shape.websiteUrl,
    websiteUrlValidationMessage,
  );
}

function validateGoogleBusinessUrl(value: string) {
  return validateOptionalUrl(
    value,
    onboardDesignerSchema.shape.googleBusinessUrl,
    googleBusinessUrlValidationMessage,
  );
}

function teamSizeToStaffCount(teamSize: string) {
  if (teamSize === 'Just me') return 1;
  if (teamSize === '50+') return 51;
  const upperBound = teamSize.split('-')[1];
  return upperBound ? Number.parseInt(upperBound, 10) : undefined;
}

async function fetchTaxonomyTerms(kind: TaxonomyKind) {
  const res = await api.api.taxonomy.terms.$get({ query: { kind } });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Could not load ${kind} options.`);
  }

  return (data as ListTaxonomyResponse).terms;
}

async function submitWithApi(input: OnboardDesignerInput) {
  const res = await api.api.profiles.me.$post({ json: input });
  const data = await res.json();

  if (!res.ok) {
    const message =
      'error' in data && data.error && typeof data.error.message === 'string'
        ? data.error.message
        : 'Could not finish onboarding. Please try again.';
    throw new Error(message);
  }

  return { data: data as OnboardDesignerResponse, created: res.status === 201 };
}

async function signOutToLogin() {
  await authClient.signOut();
  window.location.href = '/login?mode=designer';
}

export function DesignerOnboarding({
  signedInName,
  signedInAs,
  onSubmitOnboarding = submitWithApi,
}: DesignerOnboardingProps) {
  const router = useRouter();
  const formId = useId();
  const [step, setStep] = useState<OnboardingStep>('entity');
  const [entityType, setEntityType] = useState<EntityType>('individual');
  const [userName, setUserName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [firmType, setFirmType] = useState('Private Limited');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [whatsappCountry, setWhatsappCountry] = useState(countries[0]!);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [googleBusinessUrl, setGoogleBusinessUrl] = useState('');
  const [websiteUrlError, setWebsiteUrlError] = useState('');
  const [googleBusinessUrlError, setGoogleBusinessUrlError] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [linkedinHandle, setLinkedinHandle] = useState('');
  const [youtubeHandle, setYoutubeHandle] = useState('');
  const [selectedScopeIds, setSelectedScopeIds] = useState<string[]>([]);
  const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>([]);
  const [foundedYear, setFoundedYear] = useState('2021');
  const [teamSize, setTeamSize] = useState('2-10');
  const [taxonomyOptions, setTaxonomyOptions] = useState<TaxonomyOptions>(emptyTaxonomyOptions);
  const [taxonomyLoading, setTaxonomyLoading] = useState(true);
  const [taxonomyError, setTaxonomyError] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OnboardDesignerResponse | null>(null);

  const displayEmail = signedInAs || 'your Google account';
  const firstName = signedInName?.trim().split(/\s+/)[0];
  const displayNamePlaceholder = firstName ? `${firstName} Interior` : 'Your Interior';
  const companyHandlePlaceholder = companyName.trim()
    ? `@${companyName.trim().toLowerCase().replaceAll(/\s+/g, '')}`
    : '@yourstudio';
  const canSubmit = useMemo(() => {
    const hasIndividualName = entityType === 'company' || userName.trim().length >= 2;
    const hasCompany = entityType === 'individual' || companyName.trim().length >= 2;
    return hasIndividualName && hasCompany && !submitting;
  }, [companyName, entityType, submitting, userName]);

  useEffect(() => {
    let cancelled = false;

    async function loadTaxonomy() {
      setTaxonomyLoading(true);
      setTaxonomyError('');

      try {
        const [scope, theme] = await Promise.all([
          fetchTaxonomyTerms('scope'),
          fetchTaxonomyTerms('theme'),
        ]);

        if (!cancelled) {
          setTaxonomyOptions({ scope, theme });
        }
      } catch (err) {
        if (!cancelled) {
          setTaxonomyError(err instanceof Error ? err.message : 'Could not load profile options.');
        }
      } finally {
        if (!cancelled) {
          setTaxonomyLoading(false);
        }
      }
    }

    void loadTaxonomy();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleWebsiteUrlChange(value: string) {
    setWebsiteUrl(value);
    setWebsiteUrlError(validateWebsiteUrl(value));
  }

  function handleGoogleBusinessUrlChange(value: string) {
    setGoogleBusinessUrl(value);
    setGoogleBusinessUrlError(validateGoogleBusinessUrl(value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const nextWebsiteUrlError = validateWebsiteUrl(websiteUrl);
    const nextGoogleBusinessUrlError = validateGoogleBusinessUrl(googleBusinessUrl);
    setWebsiteUrlError(nextWebsiteUrlError);
    setGoogleBusinessUrlError(nextGoogleBusinessUrlError);

    if (nextWebsiteUrlError || nextGoogleBusinessUrlError) {
      return;
    }

    const trimmedUserName = userName.trim();
    const trimmedCompanyName = companyName.trim();
    const fallbackUserName = signedInName?.trim() || trimmedCompanyName;
    const effectiveUserName = entityType === 'company' ? fallbackUserName : trimmedUserName;

    if (entityType === 'individual' && trimmedUserName.length < 2) {
      setError('Add your name so clients know who they are meeting.');
      return;
    }
    if (entityType === 'company' && trimmedCompanyName.length < 2) {
      setError('Add your company name to create the studio workspace.');
      return;
    }
    if (entityType === 'individual' && step === 'details') {
      setStep('presence');
      return;
    }
    if (entityType === 'company' && step === 'details') {
      setStep('presence');
      return;
    }
    if (entityType === 'company' && step === 'presence') {
      setStep('services');
      return;
    }

    setSubmitting(true);
    try {
      const phone = toE164PhoneNumber(whatsappCountry, whatsappNumber) ?? undefined;
      const foundedYearValue = Number.parseInt(foundedYear, 10);
      const staffCount = teamSizeToStaffCount(teamSize);
      const payload: OnboardDesignerInput = {
        entityType,
        userName: effectiveUserName,
        address: address.trim() || undefined,
        scopeIds: selectedScopeIds,
        themeIds: selectedThemeIds,
        ...(entityType === 'company' ? { companyName: trimmedCompanyName } : {}),
        ...(phone ? { phone } : {}),
        ...(normalizeUrl(websiteUrl) ? { websiteUrl: normalizeUrl(websiteUrl) } : {}),
        ...(normalizeUrl(googleBusinessUrl)
          ? { googleBusinessUrl: normalizeUrl(googleBusinessUrl) }
          : {}),
        ...(optionalTrimmed(instagramHandle)
          ? { instagramHandle: optionalTrimmed(instagramHandle) }
          : {}),
        ...(optionalTrimmed(linkedinHandle)
          ? { linkedinHandle: optionalTrimmed(linkedinHandle) }
          : {}),
        ...(optionalTrimmed(youtubeHandle)
          ? { youtubeHandle: optionalTrimmed(youtubeHandle) }
          : {}),
        ...(entityType === 'company' && optionalTrimmed(firmType)
          ? { firmType: optionalTrimmed(firmType) }
          : {}),
        ...(entityType === 'company' && Number.isFinite(foundedYearValue)
          ? { foundedYear: foundedYearValue }
          : {}),
        ...(entityType === 'company' && staffCount ? { staffCount } : {}),
      };
      const response = await onSubmitOnboarding(payload);
      setResult(response.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not finish onboarding. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <OnboardingShell signedInAs={displayEmail}>
        <CompletionStep
          onAddProjects={() => router.push('/designer/projects/new')}
          onSkip={() => router.push('/designer/dashboard')}
        />
      </OnboardingShell>
    );
  }

  if (step === 'entity') {
    return (
      <OnboardingShell signedInAs={displayEmail}>
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-medium tracking-[-0.015em]">
              Let&apos;s set up your space on Tickif
            </h1>
          </div>

          <div className="flex w-full flex-col gap-8">
            <fieldset className="flex flex-col">
              <legend className="text-[13px] font-medium leading-relaxed text-muted-foreground">
                Who are you listing as?
              </legend>
              <div className="mt-3 flex flex-col gap-4">
                {entityOptions.map((option) => (
                  <EntityChoiceCard
                    key={option.value}
                    description={option.description}
                    descriptionClassName={option.descriptionClassName}
                    icon={option.icon}
                    illustration={option.illustration}
                    illustrationClassName={option.value === 'individual' ? 'w-24' : 'w-36'}
                    illustrationPositionClassName={
                      option.value === 'individual' ? 'right-5' : 'right-1'
                    }
                    selected={entityType === option.value}
                    title={option.title}
                    onClick={() => {
                      setEntityType(option.value);
                      setStep('details');
                    }}
                  />
                ))}
              </div>
            </fieldset>

            <OnboardingSecondaryActions />
          </div>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell signedInAs={displayEmail}>
      <form className="flex flex-col gap-8" onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium tracking-[-0.015em]">
            Let&apos;s set up your space on Tickif
          </h1>
        </div>

        {entityType === 'individual' && step === 'details' ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-6">
              <div className="relative shrink-0">
                <div className="flex size-[60px] items-center justify-center overflow-hidden rounded-lg border bg-card shadow-xs">
                  <InitialsAvatar
                    seed={userName}
                    fallbackSeed={displayNamePlaceholder}
                    alt="Generated profile initials"
                  />
                </div>
              </div>

              <div className="grid flex-1 gap-1 self-stretch">
                <Label
                  htmlFor={`${formId}-name`}
                  className="text-[13px] font-medium leading-relaxed"
                >
                  Display name
                </Label>
                <Input
                  id={`${formId}-name`}
                  value={userName}
                  onChange={(event) => setUserName(event.target.value)}
                  placeholder={displayNamePlaceholder}
                  autoComplete="name"
                  className="h-8 rounded-md px-2 text-[13px]"
                />
              </div>
            </div>

            <div className="grid gap-1">
              <Label
                htmlFor={`${formId}-address`}
                className="text-[13px] font-medium leading-relaxed"
              >
                Address
              </Label>
              <Input
                id={`${formId}-address`}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Studio address or service location"
                autoComplete="street-address"
                className="h-8 rounded-md px-2 text-[13px]"
              />
            </div>

            <div className="grid gap-2">
              <Label
                htmlFor={`${formId}-whatsapp`}
                className="text-[13px] font-medium leading-relaxed"
              >
                WhatsApp number{' '}
                <span className="font-normal text-muted-foreground">(Recommended)</span>
              </Label>
              <PhoneNumberInput
                id={`${formId}-whatsapp`}
                phone={whatsappNumber}
                selectedCountry={whatsappCountry}
                onPhoneChange={setWhatsappNumber}
                onSelectedCountryChange={setWhatsappCountry}
                placeholder="9123456789"
                wrapperClassName="h-8"
                countryButtonClassName="h-8 px-2 py-0 text-[13px]"
                inputClassName="h-8 text-[13px] font-medium"
              />
            </div>
          </div>
        ) : entityType === 'individual' && step === 'presence' ? (
          <PresenceFields
            firstName={firstName}
            formId={formId}
            googleBusinessUrl={googleBusinessUrl}
            instagramHandle={instagramHandle}
            linkedinHandle={linkedinHandle}
            websiteUrl={websiteUrl}
            youtubeHandle={youtubeHandle}
            onGoogleBusinessUrlChange={handleGoogleBusinessUrlChange}
            onInstagramHandleChange={setInstagramHandle}
            onLinkedinHandleChange={setLinkedinHandle}
            onWebsiteUrlChange={handleWebsiteUrlChange}
            onYoutubeHandleChange={setYoutubeHandle}
            websiteUrlError={websiteUrlError}
            googleBusinessUrlError={googleBusinessUrlError}
          />
        ) : entityType === 'company' && step === 'details' ? (
          <CompanyBasicsFields
            address={address}
            companyName={companyName}
            firmType={firmType}
            formId={formId}
            onAddressChange={setAddress}
            onCompanyNameChange={setCompanyName}
            onFirmTypeChange={setFirmType}
          />
        ) : entityType === 'company' && step === 'presence' ? (
          <CompanyPresenceFields
            formId={formId}
            googleBusinessUrl={googleBusinessUrl}
            instagramHandle={instagramHandle}
            linkedinHandle={linkedinHandle}
            placeholderHandle={companyHandlePlaceholder}
            websiteUrl={websiteUrl}
            whatsappCountry={whatsappCountry}
            whatsappNumber={whatsappNumber}
            youtubeHandle={youtubeHandle}
            onGoogleBusinessUrlChange={handleGoogleBusinessUrlChange}
            onInstagramHandleChange={setInstagramHandle}
            onLinkedinHandleChange={setLinkedinHandle}
            onWebsiteUrlChange={handleWebsiteUrlChange}
            onWhatsappCountryChange={setWhatsappCountry}
            onWhatsappNumberChange={setWhatsappNumber}
            onYoutubeHandleChange={setYoutubeHandle}
            websiteUrlError={websiteUrlError}
            googleBusinessUrlError={googleBusinessUrlError}
          />
        ) : entityType === 'company' && step === 'services' ? (
          <CompanyServicesFields
            formId={formId}
            foundedYear={foundedYear}
            scopeOptions={taxonomyOptions.scope}
            selectedScopeIds={selectedScopeIds}
            selectedThemeIds={selectedThemeIds}
            taxonomyError={taxonomyError}
            taxonomyLoading={taxonomyLoading}
            themeOptions={taxonomyOptions.theme}
            teamSize={teamSize}
            onFoundedYearChange={setFoundedYear}
            onScopeIdsChange={setSelectedScopeIds}
            onThemeIdsChange={setSelectedThemeIds}
            onTeamSizeChange={setTeamSize}
          />
        ) : null}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Could not continue</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4">
          <Button
            type="submit"
            disabled={!canSubmit}
            className="h-9 w-full cursor-pointer gap-1 rounded-lg disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Creating your space
              </>
            ) : (
              <>
                Continue
                <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
              </>
            )}
          </Button>
          <DetailsSecondaryActions onSkip={() => router.push('/designer/dashboard')} />
        </div>
      </form>
    </OnboardingShell>
  );
}

function CompletionStep({
  onAddProjects,
  onSkip,
}: {
  onAddProjects: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-medium tracking-[-0.015em]">You&apos;re set up, there! 🎉</h1>
        <p className="max-w-[358px] text-xs font-medium leading-[1.35] text-muted-foreground">
          One thing stands between you and homeowners: your first project. It&apos;s the only thing
          that makes your profile public.
        </p>
      </div>

      <div className="grid gap-3">
        <Button
          type="button"
          onClick={onAddProjects}
          className="h-9 w-full cursor-pointer gap-1 rounded-lg"
        >
          Add your projects
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        </Button>
        <DetailsSecondaryActions onSkip={onSkip} />
      </div>
    </div>
  );
}

function CompanyBasicsFields({
  address,
  companyName,
  firmType,
  formId,
  onAddressChange,
  onCompanyNameChange,
  onFirmTypeChange,
}: {
  address: string;
  companyName: string;
  firmType: string;
  formId: string;
  onAddressChange: (value: string) => void;
  onCompanyNameChange: (value: string) => void;
  onFirmTypeChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-6">
        <div className="relative shrink-0">
          <div className="flex size-[60px] items-center justify-center overflow-hidden rounded-lg border bg-card shadow-xs">
            <InitialsAvatar
              seed={companyName}
              fallbackSeed="Livspace Interiors"
              alt="Generated company logo initials"
            />
          </div>
        </div>

        <div className="grid flex-1 gap-1 self-stretch">
          <Label htmlFor={`${formId}-company`} className="text-[13px] font-medium leading-relaxed">
            Company name
          </Label>
          <Input
            id={`${formId}-company`}
            value={companyName}
            onChange={(event) => onCompanyNameChange(event.target.value)}
            placeholder="Livspace Interiors"
            autoComplete="organization"
            className="h-8 rounded-md px-2 text-[13px]"
          />
        </div>
      </div>

      <CompactSelect
        id={`${formId}-firm-type`}
        label="Firm type"
        options={firmTypeOptions}
        value={firmType}
        onValueChange={onFirmTypeChange}
      />

      <div className="grid gap-1">
        <Label htmlFor={`${formId}-address`} className="text-[13px] font-medium leading-relaxed">
          Address
        </Label>
        <Input
          id={`${formId}-address`}
          value={address}
          onChange={(event) => onAddressChange(event.target.value)}
          placeholder="Studio address or service location"
          autoComplete="street-address"
          className="h-8 rounded-md px-2 text-[13px]"
        />
      </div>
    </div>
  );
}

function CompanyPresenceFields({
  formId,
  googleBusinessUrl,
  googleBusinessUrlError,
  instagramHandle,
  linkedinHandle,
  onGoogleBusinessUrlChange,
  onInstagramHandleChange,
  onLinkedinHandleChange,
  onWebsiteUrlChange,
  onWhatsappCountryChange,
  onWhatsappNumberChange,
  onYoutubeHandleChange,
  placeholderHandle,
  websiteUrl,
  websiteUrlError,
  whatsappCountry,
  whatsappNumber,
  youtubeHandle,
}: {
  formId: string;
  googleBusinessUrl: string;
  googleBusinessUrlError: string;
  instagramHandle: string;
  linkedinHandle: string;
  placeholderHandle: string;
  websiteUrl: string;
  websiteUrlError: string;
  whatsappCountry: (typeof countries)[number];
  whatsappNumber: string;
  youtubeHandle: string;
  onGoogleBusinessUrlChange: (value: string) => void;
  onInstagramHandleChange: (value: string) => void;
  onLinkedinHandleChange: (value: string) => void;
  onWebsiteUrlChange: (value: string) => void;
  onWhatsappCountryChange: (value: (typeof countries)[number]) => void;
  onWhatsappNumberChange: (value: string) => void;
  onYoutubeHandleChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-2">
        <Label
          htmlFor={`${formId}-company-whatsapp`}
          className="text-[13px] font-medium leading-relaxed"
        >
          WhatsApp number <span className="font-normal text-muted-foreground">(Recommended)</span>
        </Label>
        <PhoneNumberInput
          id={`${formId}-company-whatsapp`}
          phone={whatsappNumber}
          selectedCountry={whatsappCountry}
          onPhoneChange={onWhatsappNumberChange}
          onSelectedCountryChange={onWhatsappCountryChange}
          placeholder="9123456789"
          wrapperClassName="h-8"
          countryButtonClassName="h-8 px-2 py-0 text-[13px]"
          inputClassName="h-8 text-[13px] font-medium"
        />
      </div>

      <PresenceFields
        formId={formId}
        googleBusinessHint="Used for ratings"
        googleBusinessUrl={googleBusinessUrl}
        instagramHandle={instagramHandle}
        linkedinHandle={linkedinHandle}
        placeholderHandle={placeholderHandle}
        websiteUrl={websiteUrl}
        websiteUrlError={websiteUrlError}
        googleBusinessUrlError={googleBusinessUrlError}
        youtubeHandle={youtubeHandle}
        onGoogleBusinessUrlChange={onGoogleBusinessUrlChange}
        onInstagramHandleChange={onInstagramHandleChange}
        onLinkedinHandleChange={onLinkedinHandleChange}
        onWebsiteUrlChange={onWebsiteUrlChange}
        onYoutubeHandleChange={onYoutubeHandleChange}
      />
    </div>
  );
}

function CompanyServicesFields({
  formId,
  foundedYear,
  onFoundedYearChange,
  onScopeIdsChange,
  onThemeIdsChange,
  onTeamSizeChange,
  scopeOptions,
  selectedScopeIds,
  selectedThemeIds,
  taxonomyError,
  taxonomyLoading,
  themeOptions,
  teamSize,
}: {
  formId: string;
  foundedYear: string;
  scopeOptions: readonly TaxonomyTerm[];
  selectedScopeIds: string[];
  selectedThemeIds: string[];
  taxonomyError: string;
  taxonomyLoading: boolean;
  themeOptions: readonly TaxonomyTerm[];
  teamSize: string;
  onFoundedYearChange: (value: string) => void;
  onScopeIdsChange: (value: string[]) => void;
  onThemeIdsChange: (value: string[]) => void;
  onTeamSizeChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {taxonomyError ? <p className="text-xs text-destructive">{taxonomyError}</p> : null}

      <TaxonomyMultiSelect
        id={`${formId}-services`}
        label="Services offered"
        labelHint="Select all that apply"
        emptyLabel={taxonomyLoading ? 'Loading services...' : 'No services available'}
        options={scopeOptions}
        values={selectedScopeIds}
        onValuesChange={onScopeIdsChange}
      />

      <TaxonomyMultiSelect
        id={`${formId}-themes`}
        label="Design themes"
        labelHint="Select all that apply"
        emptyLabel={taxonomyLoading ? 'Loading themes...' : 'No themes available'}
        options={themeOptions}
        values={selectedThemeIds}
        onValuesChange={onThemeIdsChange}
      />

      <div className="grid grid-cols-2 gap-5">
        <CompactSelect
          id={`${formId}-founded`}
          label="Founded"
          options={foundedOptions}
          value={foundedYear}
          onValueChange={onFoundedYearChange}
        />
        <CompactSelect
          id={`${formId}-team-size`}
          label="Team size"
          options={teamSizeOptions}
          value={teamSize}
          onValueChange={onTeamSizeChange}
        />
      </div>
    </div>
  );
}

function TaxonomyMultiSelect({
  emptyLabel,
  id,
  label,
  labelHint,
  onValuesChange,
  options,
  values,
}: {
  id: string;
  label: string;
  labelHint?: string;
  values: string[];
  options: readonly TaxonomyTerm[];
  emptyLabel: string;
  onValuesChange: (values: string[]) => void;
}) {
  const selectedLabels = options
    .filter((option) => values.includes(option.id))
    .map((option) => option.label);
  const displayValue = selectedLabels.length > 0 ? selectedLabels.join(', ') : 'Select options';

  function toggleOption(optionId: string) {
    if (values.includes(optionId)) {
      onValuesChange(values.filter((value) => value !== optionId));
      return;
    }
    onValuesChange([...values, optionId]);
  }

  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-[13px] font-medium leading-relaxed">
        {label}{' '}
        {labelHint ? (
          <span className="font-normal text-muted-foreground">({labelHint})</span>
        ) : null}
      </Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            id={id}
            type="button"
            className="flex h-8 w-full items-center justify-between gap-3 rounded-md border bg-background px-2 text-left text-[13px] font-medium shadow-xs outline-none transition-colors hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="min-w-0 truncate">{displayValue}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={2}
          collisionPadding={8}
          className="w-[var(--radix-dropdown-menu-trigger-width)]"
        >
          {options.length > 0 ? (
            options.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.id}
                checked={values.includes(option.id)}
                onCheckedChange={() => toggleOption(option.id)}
                onSelect={(event) => event.preventDefault()}
                className="text-[13px]"
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))
          ) : (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">{emptyLabel}</div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function CompactSelect({
  id,
  label,
  labelHint,
  onValueChange,
  options,
  value,
}: {
  id: string;
  label: string;
  labelHint?: string;
  value: string;
  options: readonly string[];
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-[13px] font-medium leading-relaxed">
        {label}{' '}
        {labelHint ? (
          <span className="font-normal text-muted-foreground">({labelHint})</span>
        ) : null}
      </Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            id={id}
            type="button"
            className="flex h-8 w-full items-center justify-between rounded-md border bg-background px-2 text-left text-[13px] font-medium shadow-xs outline-none transition-colors hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span>{value}</span>
            <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={2}
          collisionPadding={8}
          className="w-[var(--radix-dropdown-menu-trigger-width)]"
        >
          {options.map((option) => (
            <DropdownMenuItem
              key={option}
              onSelect={() => onValueChange(option)}
              className="text-[13px]"
            >
              {option}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function PresenceFields({
  firstName,
  formId,
  googleBusinessHint = 'Used to pull your reviews',
  googleBusinessUrl,
  googleBusinessUrlError,
  instagramHandle,
  linkedinHandle,
  onGoogleBusinessUrlChange,
  onInstagramHandleChange,
  onLinkedinHandleChange,
  onWebsiteUrlChange,
  onYoutubeHandleChange,
  placeholderHandle,
  websiteUrl,
  websiteUrlError,
  youtubeHandle,
}: {
  firstName?: string;
  formId: string;
  googleBusinessHint?: string;
  googleBusinessUrl: string;
  googleBusinessUrlError: string;
  instagramHandle: string;
  linkedinHandle: string;
  placeholderHandle?: string;
  websiteUrl: string;
  websiteUrlError: string;
  youtubeHandle: string;
  onGoogleBusinessUrlChange: (value: string) => void;
  onInstagramHandleChange: (value: string) => void;
  onLinkedinHandleChange: (value: string) => void;
  onWebsiteUrlChange: (value: string) => void;
  onYoutubeHandleChange: (value: string) => void;
}) {
  const handlePlaceholder =
    placeholderHandle ?? (firstName ? `@${firstName.toLowerCase()}` : '@yourstudio');

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-1">
        <Label htmlFor={`${formId}-website`} className="text-[13px] font-medium leading-relaxed">
          Website
        </Label>
        <Input
          id={`${formId}-website`}
          type="url"
          value={websiteUrl}
          onChange={(event) => onWebsiteUrlChange(event.target.value)}
          placeholder="https://"
          autoComplete="url"
          inputMode="url"
          className="h-8 rounded-md px-2 text-[13px]"
        />
        {websiteUrlError ? <p className="text-xs text-destructive">{websiteUrlError}</p> : null}
      </div>

      <div className="grid gap-1">
        <Label
          htmlFor={`${formId}-google-business`}
          className="text-[13px] font-medium leading-relaxed"
        >
          Google Business{' '}
          <span className="font-normal text-muted-foreground">({googleBusinessHint})</span>
        </Label>
        <Input
          id={`${formId}-google-business`}
          type="url"
          value={googleBusinessUrl}
          onChange={(event) => onGoogleBusinessUrlChange(event.target.value)}
          placeholder="https://"
          inputMode="url"
          className="h-8 rounded-md px-2 text-[13px]"
        />
        {googleBusinessUrlError ? (
          <p className="text-xs text-destructive">{googleBusinessUrlError}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <p className="text-[13px] font-medium leading-relaxed">Social links</p>
        <div className="grid gap-3">
          <SocialInput
            id={`${formId}-instagram`}
            icon={InstagramBrandIcon}
            label="Instagram"
            value={instagramHandle}
            onChange={onInstagramHandleChange}
            placeholder={handlePlaceholder}
          />
          <SocialInput
            id={`${formId}-linkedin`}
            icon={LinkedInBrandIcon}
            label="LinkedIn"
            value={linkedinHandle}
            onChange={onLinkedinHandleChange}
            placeholder="LinkedIn handle..."
          />
          <SocialInput
            id={`${formId}-youtube`}
            icon={YouTubeBrandIcon}
            label="YouTube"
            value={youtubeHandle}
            onChange={onYoutubeHandleChange}
            placeholder="YouTube handle..."
          />
        </div>
      </div>
    </div>
  );
}

function SocialInput({
  icon: Icon,
  id,
  label,
  onChange,
  placeholder,
  value,
}: {
  icon: (props: { className?: string }) => ReactNode;
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex h-8 overflow-hidden rounded-md border bg-background shadow-xs">
      <label
        htmlFor={id}
        className="flex w-11 shrink-0 items-center justify-center border-r bg-muted/30 text-muted-foreground"
        aria-label={label}
      >
        <Icon className="size-4" aria-hidden="true" />
      </label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-full border-0 bg-transparent px-3 text-[13px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}

function EntityChoiceCard({
  description,
  descriptionClassName,
  icon: Icon,
  illustration,
  illustrationClassName,
  illustrationPositionClassName,
  onClick,
  selected,
  title,
}: {
  description: string;
  descriptionClassName?: string;
  icon: typeof UserRound;
  illustration: string;
  illustrationClassName: string;
  illustrationPositionClassName: string;
  onClick: () => void;
  selected: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'relative min-h-[150px] w-full overflow-hidden rounded-[14px] border bg-card p-[21px] text-left transition-colors',
        'hover:border-primary hover:bg-accent/30 hover:ring-[3px] hover:ring-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        selected && 'border-border',
      )}
    >
      <span
        className="flex size-12 items-center justify-center rounded-lg bg-secondary"
        aria-hidden="true"
      >
        <Icon className="size-4 text-primary" />
      </span>
      <span className="mt-2.5 flex flex-col gap-1.5">
        <span className="text-base font-medium leading-none">{title}</span>
        <span
          className={cn(
            'max-w-[260px] text-[13px] leading-relaxed text-muted-foreground',
            descriptionClassName,
          )}
        >
          {description}
        </span>
      </span>
      <Image
        src={illustration}
        alt=""
        width={220}
        height={170}
        className={cn(
          'pointer-events-none absolute bottom-[-3px] h-auto',
          illustrationClassName,
          illustrationPositionClassName,
        )}
      />
    </button>
  );
}

function OnboardingSecondaryActions() {
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
      <a
        href="mailto:support@tickif.in"
        className="cursor-pointer font-medium text-foreground hover:underline"
      >
        Need help? Contact support
      </a>
      <span className="size-0.5 rounded-full bg-muted-foreground" aria-hidden="true" />
      <button
        type="button"
        onClick={signOutToLogin}
        className="cursor-pointer font-medium text-foreground hover:underline"
      >
        Sign out
      </button>
    </div>
  );
}

function DetailsSecondaryActions({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
      <a
        href="mailto:support@tickif.in"
        className="cursor-pointer font-medium text-foreground hover:underline"
      >
        Need help? Contact support
      </a>
      <span className="size-0.5 rounded-full bg-muted-foreground" aria-hidden="true" />
      <button
        type="button"
        onClick={onSkip}
        className="cursor-pointer font-medium text-foreground hover:underline"
      >
        Skip to dashboard
      </button>
    </div>
  );
}

function OnboardingShell({ children, signedInAs }: { children: ReactNode; signedInAs: string }) {
  return (
    <main className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(420px,600px)]">
        <section className="flex items-center justify-center px-5 py-12 sm:px-8">
          <div className="w-full max-w-[450px]">
            <div className="mb-8 flex items-center gap-2 text-left text-xs text-muted-foreground">
              <span>
                <span className="text-muted-foreground/70">Signed in as </span>
                <span className="font-medium text-muted-foreground">{signedInAs}</span>
              </span>
            </div>
            {children}
          </div>
        </section>

        <aside className="relative hidden overflow-hidden border-l bg-card lg:block">
          <div className="absolute inset-y-0 left-6 z-20 border-l border-dashed border-border" />
          <div className="absolute inset-y-0 left-50 border-l border-dashed border-border" />
          <div className="absolute inset-y-0 left-6 w-44 bg-background/20" />
          <div className="absolute left-0 right-0 top-[38%] h-px bg-border" />
          <div className="absolute left-0 right-0 top-[62%] h-px bg-border" />
          <div className="absolute left-6 right-0 top-[38%] h-[24%] bg-background" />
          <div className="absolute left-6 right-0 top-[38%] z-10 h-px bg-border" />
          <div className="relative flex h-full items-center px-12">
            <div className="max-w-sm">
              <blockquote className="text-xl leading-[25px] tracking-normal">
                &quot;Tickif is why I still have hair. No more worrying about{' '}
                <span className="text-primary">getting clients.</span>&quot;
              </blockquote>
              <div className="mt-8 flex items-center gap-3">
                <div className="size-8 rounded-full bg-secondary" />
                <div>
                  <p className="text-sm font-medium">Antika M.</p>
                  <p className="text-xs text-muted-foreground">Antika Interiors</p>
                </div>
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-12 left-0 right-0 z-10 h-px bg-border xl:bottom-14"
            aria-hidden="true"
          />
          <div className="absolute bottom-3 right-0 w-80 xl:w-96">
            <Image
              src={onboardingIllustrations.panel}
              alt=""
              width={334}
              height={188}
              priority
              className="h-auto w-full"
            />
          </div>
        </aside>
      </div>
    </main>
  );
}
