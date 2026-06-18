'use client';

import type { FormEvent, ReactNode } from 'react';
import { useId, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Instagram,
  Linkedin,
  Loader2,
  UserRound,
  X,
  Youtube,
} from 'lucide-react';
import type { OnboardDesignerInput, OnboardDesignerResponse } from '@repo/contracts';
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
import { PhoneNumberInput, countries } from '@/components/phone-number-input';

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

const cityOptions = [
  'Ahmedabad',
  'Bengaluru',
  'Chandigarh',
  'Chennai',
  'Delhi NCR',
  'Hyderabad',
  'Jaipur',
  'Kochi',
  'Kolkata',
  'Mumbai',
  'Pune',
] as const;

type OnboardingStep = 'entity' | 'details' | 'presence' | 'services';

const firmTypeOptions = [
  'Private Limited',
  'LLP',
  'Partnership',
  'Proprietorship',
  'Studio',
] as const;

const serviceOptions = [
  'Full Home Interiors',
  'Modular Kitchen',
  'Renovation',
  'Commercial Interiors',
  'Styling & Decor',
] as const;

const foundedOptions = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018'] as const;

const teamSizeOptions = ['Just me', '2-10', '11-25', '26-50', '50+'] as const;

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
  const [city, setCity] = useState('Chennai');
  const [citySearch, setCitySearch] = useState('');
  const [firmType, setFirmType] = useState('Private Limited');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [whatsappCountry, setWhatsappCountry] = useState(countries[0]!);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [googleBusinessUrl, setGoogleBusinessUrl] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [linkedinHandle, setLinkedinHandle] = useState('');
  const [youtubeHandle, setYoutubeHandle] = useState('');
  const [servicesOffered, setServicesOffered] = useState<string[]>(['Full Home Interiors']);
  const [foundedYear, setFoundedYear] = useState('2021');
  const [teamSize, setTeamSize] = useState('2-10');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OnboardDesignerResponse | null>(null);

  const displayEmail = signedInAs || 'your Google account';
  const firstName = signedInName?.trim().split(/\s+/)[0];
  const displayNamePlaceholder = firstName ? `${firstName} Interior` : 'Your Interior';
  const companyHandlePlaceholder = companyName.trim()
    ? `@${companyName.trim().toLowerCase().replaceAll(/\s+/g, '')}`
    : '@yourstudio';
  const filteredCities = citySearch
    ? cityOptions.filter((option) => option.toLowerCase().includes(citySearch.toLowerCase()))
    : cityOptions;
  const canSubmit = useMemo(() => {
    const hasIndividualName = entityType === 'company' || userName.trim().length >= 2;
    const hasCompany = entityType === 'individual' || companyName.trim().length >= 2;
    return hasIndividualName && hasCompany && !submitting;
  }, [companyName, entityType, submitting, userName]);

  function handleBack() {
    if (step === 'entity') {
      router.push('/');
      return;
    }
    if (step === 'services') {
      setStep('presence');
      return;
    }
    setStep(step === 'presence' ? 'details' : 'entity');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

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
      const payload: OnboardDesignerInput = {
        entityType,
        userName: effectiveUserName,
        companyName: entityType === 'company' ? trimmedCompanyName : undefined,
        cityIds: [],
        scopeIds: [],
        themeIds: [],
      };
      const response = await onSubmitOnboarding(payload);
      setResult(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish onboarding. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <OnboardingShell signedInAs={displayEmail} onBack={() => router.push('/designer/dashboard')}>
        <CompletionStep onAddProjects={() => router.push('/designer/dashboard')} onSkip={() => router.push('/designer/dashboard')} />
      </OnboardingShell>
    );
  }

  if (step === 'entity') {
    return (
      <OnboardingShell signedInAs={displayEmail} onBack={handleBack}>
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
                    illustrationPositionClassName={option.value === 'individual' ? 'right-5' : 'right-1'}
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
    <OnboardingShell signedInAs={displayEmail} onBack={handleBack}>
      <form className="flex flex-col gap-8" onSubmit={handleSubmit}>
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
                  <UserRound className="size-9 text-muted-foreground" aria-hidden="true" />
                </div>
                <button
                  type="button"
                  aria-label="Remove profile image"
                  className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full border bg-background"
                >
                  <X className="size-3 text-muted-foreground" aria-hidden="true" />
                </button>
              </div>

              <div className="grid flex-1 gap-1 self-stretch">
                <Label htmlFor={`${formId}-name`} className="text-[13px] font-medium leading-relaxed">
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
              <Label htmlFor={`${formId}-city`} className="text-[13px] font-medium leading-relaxed">
                City
              </Label>
              <CitySelect
                id={`${formId}-city`}
                city={city}
                citySearch={citySearch}
                options={filteredCities}
                onCityChange={setCity}
                onSearchChange={setCitySearch}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${formId}-whatsapp`} className="text-[13px] font-medium leading-relaxed">
                WhatsApp number <span className="font-normal text-muted-foreground">(Recommended)</span>
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
            onGoogleBusinessUrlChange={setGoogleBusinessUrl}
            onInstagramHandleChange={setInstagramHandle}
            onLinkedinHandleChange={setLinkedinHandle}
            onWebsiteUrlChange={setWebsiteUrl}
            onYoutubeHandleChange={setYoutubeHandle}
          />
        ) : entityType === 'company' && step === 'details' ? (
          <CompanyBasicsFields
            city={city}
            citySearch={citySearch}
            companyName={companyName}
            firmType={firmType}
            formId={formId}
            filteredCities={filteredCities}
            onCityChange={setCity}
            onCitySearchChange={setCitySearch}
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
            onGoogleBusinessUrlChange={setGoogleBusinessUrl}
            onInstagramHandleChange={setInstagramHandle}
            onLinkedinHandleChange={setLinkedinHandle}
            onWebsiteUrlChange={setWebsiteUrl}
            onWhatsappCountryChange={setWhatsappCountry}
            onWhatsappNumberChange={setWhatsappNumber}
            onYoutubeHandleChange={setYoutubeHandle}
          />
        ) : entityType === 'company' && step === 'services' ? (
          <CompanyServicesFields
            formId={formId}
            foundedYear={foundedYear}
            servicesOffered={servicesOffered}
            teamSize={teamSize}
            onFoundedYearChange={setFoundedYear}
            onServicesOfferedChange={setServicesOffered}
            onTeamSizeChange={setTeamSize}
          />
        ) : (
          null
        )}

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
        <h1 className="text-lg font-medium tracking-[-0.015em]">
          You&apos;re set up, there! 🎉
        </h1>
        <p className="max-w-[358px] text-xs font-medium leading-[1.35] text-muted-foreground">
          One thing stands between you and homeowners: your first project. It&apos;s the only
          thing that makes your profile public.
        </p>
      </div>

      <div className="grid gap-3">
        <Button type="button" onClick={onAddProjects} className="h-9 w-full cursor-pointer gap-1 rounded-lg">
          Add your projects
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        </Button>
        <DetailsSecondaryActions onSkip={onSkip} />
      </div>
    </div>
  );
}

function CompanyBasicsFields({
  city,
  citySearch,
  companyName,
  filteredCities,
  firmType,
  formId,
  onCityChange,
  onCitySearchChange,
  onCompanyNameChange,
  onFirmTypeChange,
}: {
  city: string;
  citySearch: string;
  companyName: string;
  filteredCities: readonly string[];
  firmType: string;
  formId: string;
  onCityChange: (value: string) => void;
  onCitySearchChange: (value: string) => void;
  onCompanyNameChange: (value: string) => void;
  onFirmTypeChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-6">
        <div className="relative shrink-0">
          <div className="flex size-[60px] items-center justify-center overflow-hidden rounded-lg border bg-card shadow-xs">
            <BriefcaseBusiness className="size-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <button
            type="button"
            aria-label="Remove company logo"
            className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full border bg-background"
          >
            <X className="size-3 text-muted-foreground" aria-hidden="true" />
          </button>
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
        <Label htmlFor={`${formId}-city`} className="text-[13px] font-medium leading-relaxed">
          Cities you take projects in
        </Label>
        <CitySelect
          id={`${formId}-city`}
          city={city}
          citySearch={citySearch}
          options={filteredCities}
          onCityChange={onCityChange}
          onSearchChange={onCitySearchChange}
        />
      </div>
    </div>
  );
}

function CompanyPresenceFields({
  formId,
  googleBusinessUrl,
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
  whatsappCountry,
  whatsappNumber,
  youtubeHandle,
}: {
  formId: string;
  googleBusinessUrl: string;
  instagramHandle: string;
  linkedinHandle: string;
  placeholderHandle: string;
  websiteUrl: string;
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
        <Label htmlFor={`${formId}-company-whatsapp`} className="text-[13px] font-medium leading-relaxed">
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
  onServicesOfferedChange,
  onTeamSizeChange,
  servicesOffered,
  teamSize,
}: {
  formId: string;
  foundedYear: string;
  servicesOffered: string[];
  teamSize: string;
  onFoundedYearChange: (value: string) => void;
  onServicesOfferedChange: (value: string[]) => void;
  onTeamSizeChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <CompactMultiSelect
        id={`${formId}-services`}
        label="Services offered"
        labelHint="Select all that apply"
        options={serviceOptions}
        values={servicesOffered}
        onValuesChange={onServicesOfferedChange}
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

function CompactMultiSelect({
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
  options: readonly string[];
  onValuesChange: (values: string[]) => void;
}) {
  const displayValue = values.length > 0 ? values.join(', ') : 'Select services';

  function toggleOption(option: string) {
    if (values.includes(option)) {
      onValuesChange(values.filter((value) => value !== option));
      return;
    }
    onValuesChange([...values, option]);
  }

  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-[13px] font-medium leading-relaxed">
        {label}{' '}
        {labelHint ? <span className="font-normal text-muted-foreground">({labelHint})</span> : null}
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
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option}
              checked={values.includes(option)}
              onCheckedChange={() => toggleOption(option)}
              onSelect={(event) => event.preventDefault()}
              className="text-[13px]"
            >
              {option}
            </DropdownMenuCheckboxItem>
          ))}
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
        {labelHint ? <span className="font-normal text-muted-foreground">({labelHint})</span> : null}
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
            <DropdownMenuItem key={option} onSelect={() => onValueChange(option)} className="text-[13px]">
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
  instagramHandle,
  linkedinHandle,
  onGoogleBusinessUrlChange,
  onInstagramHandleChange,
  onLinkedinHandleChange,
  onWebsiteUrlChange,
  onYoutubeHandleChange,
  placeholderHandle,
  websiteUrl,
  youtubeHandle,
}: {
  firstName?: string;
  formId: string;
  googleBusinessHint?: string;
  googleBusinessUrl: string;
  instagramHandle: string;
  linkedinHandle: string;
  placeholderHandle?: string;
  websiteUrl: string;
  youtubeHandle: string;
  onGoogleBusinessUrlChange: (value: string) => void;
  onInstagramHandleChange: (value: string) => void;
  onLinkedinHandleChange: (value: string) => void;
  onWebsiteUrlChange: (value: string) => void;
  onYoutubeHandleChange: (value: string) => void;
}) {
  const handlePlaceholder = placeholderHandle ?? (firstName ? `@${firstName.toLowerCase()}` : '@yourstudio');

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-1">
        <Label htmlFor={`${formId}-website`} className="text-[13px] font-medium leading-relaxed">
          Website
        </Label>
        <Input
          id={`${formId}-website`}
          value={websiteUrl}
          onChange={(event) => onWebsiteUrlChange(event.target.value)}
          placeholder="https://"
          autoComplete="url"
          inputMode="url"
          className="h-8 rounded-md px-2 text-[13px]"
        />
      </div>

      <div className="grid gap-1">
        <Label htmlFor={`${formId}-google-business`} className="text-[13px] font-medium leading-relaxed">
          Google Business{' '}
          <span className="font-normal text-muted-foreground">({googleBusinessHint})</span>
        </Label>
        <Input
          id={`${formId}-google-business`}
          value={googleBusinessUrl}
          onChange={(event) => onGoogleBusinessUrlChange(event.target.value)}
          placeholder="https://"
          inputMode="url"
          className="h-8 rounded-md px-2 text-[13px]"
        />
      </div>

      <div className="grid gap-2">
        <p className="text-[13px] font-medium leading-relaxed">Social links</p>
        <div className="grid gap-3">
          <SocialInput
            id={`${formId}-instagram`}
            icon={Instagram}
            label="Instagram"
            value={instagramHandle}
            onChange={onInstagramHandleChange}
            placeholder={handlePlaceholder}
          />
          <SocialInput
            id={`${formId}-linkedin`}
            icon={Linkedin}
            label="LinkedIn"
            value={linkedinHandle}
            onChange={onLinkedinHandleChange}
            placeholder="LinkedIn handle..."
          />
          <SocialInput
            id={`${formId}-youtube`}
            icon={Youtube}
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
  icon: typeof Instagram;
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

function CitySelect({
  city,
  citySearch,
  id,
  onCityChange,
  onSearchChange,
  options,
}: {
  city: string;
  citySearch: string;
  id: string;
  onCityChange: (city: string) => void;
  onSearchChange: (search: string) => void;
  options: readonly string[];
}) {
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) onSearchChange('');
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          id={id}
          type="button"
          className="flex h-8 w-full items-center justify-between rounded-md border bg-background px-2 text-left text-[13px] font-medium shadow-xs outline-none transition-colors hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span>{city || 'Select your city'}</span>
          <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={2}
        collisionPadding={8}
        className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
      >
        <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 bg-popover px-1 pt-1 shadow-sm">
          <input
            type="text"
            value={citySearch}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && citySearch) {
                event.preventDefault();
                onSearchChange('');
                return;
              }
              event.stopPropagation();
            }}
            placeholder="Search city..."
            className="w-full rounded-sm border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            autoFocus
          />
        </div>
        {options.length > 0 ? (
          options.map((option) => (
            <DropdownMenuItem
              key={option}
              onSelect={() => onCityChange(option)}
              className="text-[13px]"
            >
              {option}
            </DropdownMenuItem>
          ))
        ) : (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            No cities found
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
      <span className="flex size-12 items-center justify-center rounded-lg bg-secondary" aria-hidden="true">
        <Icon className="size-4 text-primary" />
      </span>
      <span className="mt-2.5 flex flex-col gap-1.5">
        <span className="text-base font-medium leading-none">{title}</span>
        <span className={cn('max-w-[260px] text-[13px] leading-relaxed text-muted-foreground', descriptionClassName)}>
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
  async function handleSignOut() {
    await authClient.signOut();
    window.location.href = '/login';
  }

  return (
    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
      <button type="button" className="cursor-pointer font-medium text-foreground hover:underline">
        Need help? Contact support
      </button>
      <span className="size-0.5 rounded-full bg-muted-foreground" aria-hidden="true" />
      <button
        type="button"
        onClick={handleSignOut}
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
      <button type="button" className="cursor-pointer font-medium text-foreground hover:underline">
        Need help? Contact support
      </button>
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

function OnboardingShell({
  children,
  onBack,
  signedInAs,
}: {
  children: ReactNode;
  onBack: () => void;
  signedInAs: string;
}) {
  return (
    <main className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(420px,600px)]">
        <section className="flex items-center justify-center px-5 py-12 sm:px-8">
          <div className="w-full max-w-[450px]">
            <button
              type="button"
              onClick={onBack}
              className="mb-8 flex cursor-pointer items-center gap-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              <span>
                <span className="text-muted-foreground/70">Signed in as </span>
                <span className="font-medium text-muted-foreground">{signedInAs}</span>
              </span>
            </button>
            {children}
          </div>
        </section>

        <aside className="relative hidden overflow-hidden border-l bg-card lg:block">
          <div className="absolute inset-y-0 left-6 w-44 border-x border-dashed bg-background/20" />
          <div className="absolute left-0 right-0 top-[38%] h-px bg-border" />
          <div className="absolute left-0 right-0 top-[62%] h-px bg-border" />
          <div className="absolute left-6 right-0 top-[38%] h-[24%] bg-background" />
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
