'use client';

import { useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  PROFILE_FOOTPRINT_LIMITS,
  designerEntityType,
  updateProfileSchema,
  type CurrentProfileResponse,
  type ProfileCompletionResponse,
  type ProfileOwnerResponse,
  type UpdateProfileInput,
} from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/card';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import { Textarea } from '@repo/ui/components/textarea';
import { InitialsAvatar } from '@/components/initials-avatar';
import {
  PhoneNumberInput,
  countries,
  normalizePhoneInput,
  toE164PhoneNumber,
  type Country,
} from '@/components/phone-number-input';
import { TaxonomyMultiSelect } from '@/components/taxonomy-multi-select';
import { fetchProfileCompletion, updateDesignerProfile } from '@/lib/profile-editor-api';
import { PROFILE_TAXONOMY_KIND } from '@/lib/profile-editor-types';
import type { ProfileEditorTaxonomy } from '@/lib/profile-editor-types';
import { isPublicHttpUrl, normalizeOptionalUrl } from '@/lib/url';

const entityTypeOptions = [
  { value: designerEntityType.enum.individual, label: 'Individual designer' },
  { value: designerEntityType.enum.company, label: 'Interior company' },
] as const;

type FormState = {
  displayName: string;
  bio: string;
  entityType: ProfileOwnerResponse['entityType'];
  address: string;
  country: Country;
  phone: string;
  websiteUrl: string;
  instagramHandle: string;
  linkedinHandle: string;
  youtubeHandle: string;
  firmType: string;
  foundedYear: string;
  staffCount: string;
  cityIds: string[];
  scopeIds: string[];
  themeIds: string[];
};

type ValidationErrors = Record<string, string>;

type FieldAria = {
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
};

function Field({
  children,
  error,
  htmlFor,
  label,
}: {
  children: (aria: FieldAria) => ReactNode;
  error?: string;
  htmlFor: string;
  label: string;
}) {
  const errorId = `${htmlFor}-error`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children({
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function splitPhone(value: string | null): { country: Country; phone: string } {
  const fallback = countries[0]!;
  return value ? normalizePhoneInput(value, fallback) : { country: fallback, phone: '' };
}

function profileToForm(profile: ProfileOwnerResponse): FormState {
  const phone = splitPhone(profile.phone);
  return {
    displayName: profile.displayName,
    bio: profile.bio ?? '',
    entityType: profile.entityType,
    address: profile.address ?? '',
    country: phone.country,
    phone: phone.phone,
    websiteUrl: profile.websiteUrl ?? '',
    instagramHandle: profile.instagramHandle ?? '',
    linkedinHandle: profile.linkedinHandle ?? '',
    youtubeHandle: profile.youtubeHandle ?? '',
    firmType: profile.firmType ?? '',
    foundedYear: profile.foundedYear?.toString() ?? '',
    staffCount: profile.staffCount?.toString() ?? '',
    cityIds: profile.footprint
      .filter((term) => term.kind === PROFILE_TAXONOMY_KIND.CITY)
      .map((term) => term.id),
    scopeIds: profile.footprint
      .filter((term) => term.kind === PROFILE_TAXONOMY_KIND.SCOPE)
      .map((term) => term.id),
    themeIds: profile.footprint
      .filter((term) => term.kind === PROFILE_TAXONOMY_KIND.THEME)
      .map((term) => term.id),
  };
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableNumber(value: string): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((id) => rightIds.has(id));
}

function formsEqual(left: FormState, right: FormState): boolean {
  const companyFieldsEqual =
    left.entityType !== designerEntityType.enum.company ||
    right.entityType !== designerEntityType.enum.company ||
    (left.firmType === right.firmType &&
      left.foundedYear === right.foundedYear &&
      left.staffCount === right.staffCount);

  return (
    left.displayName === right.displayName &&
    left.bio === right.bio &&
    left.entityType === right.entityType &&
    left.address === right.address &&
    left.country.isoCode === right.country.isoCode &&
    left.phone === right.phone &&
    left.websiteUrl === right.websiteUrl &&
    left.instagramHandle === right.instagramHandle &&
    left.linkedinHandle === right.linkedinHandle &&
    left.youtubeHandle === right.youtubeHandle &&
    companyFieldsEqual &&
    sameIds(left.cityIds, right.cityIds) &&
    sameIds(left.scopeIds, right.scopeIds) &&
    sameIds(left.themeIds, right.themeIds)
  );
}

function formToInput(
  form: FormState,
  saved: FormState,
): { input: UpdateProfileInput; errors: ValidationErrors } {
  const input: UpdateProfileInput = {};
  const errors: ValidationErrors = {};

  if (form.displayName !== saved.displayName) input.displayName = form.displayName.trim();
  if (form.bio !== saved.bio) input.bio = nullable(form.bio);
  if (form.entityType !== saved.entityType) input.entityType = form.entityType;
  if (form.address !== saved.address) input.address = nullable(form.address);
  if (form.websiteUrl !== saved.websiteUrl) {
    const websiteUrl = normalizeOptionalUrl(form.websiteUrl);
    if (websiteUrl && !isPublicHttpUrl(websiteUrl)) errors.websiteUrl = 'Enter a valid URL.';
    input.websiteUrl = websiteUrl ?? null;
  }
  if (form.instagramHandle !== saved.instagramHandle) {
    input.instagramHandle = nullable(form.instagramHandle);
  }
  if (form.linkedinHandle !== saved.linkedinHandle) {
    input.linkedinHandle = nullable(form.linkedinHandle);
  }
  if (form.youtubeHandle !== saved.youtubeHandle) {
    input.youtubeHandle = nullable(form.youtubeHandle);
  }

  if (form.country.isoCode !== saved.country.isoCode || form.phone !== saved.phone) {
    const phone = toE164PhoneNumber(form.country, form.phone);
    if (form.phone && !phone) errors.phone = 'Enter a valid phone number.';
    else input.phone = phone;
  }

  if (form.entityType === designerEntityType.enum.company) {
    if (form.firmType !== saved.firmType) input.firmType = nullable(form.firmType);
    if (form.foundedYear !== saved.foundedYear) {
      input.foundedYear = nullableNumber(form.foundedYear);
    }
    if (form.staffCount !== saved.staffCount) input.staffCount = nullableNumber(form.staffCount);
  }

  if (!sameIds(form.cityIds, saved.cityIds)) input.cityIds = form.cityIds;
  if (!sameIds(form.scopeIds, saved.scopeIds)) input.scopeIds = form.scopeIds;
  if (!sameIds(form.themeIds, saved.themeIds)) input.themeIds = form.themeIds;

  return { input, errors };
}

function collectValidationErrors(
  input: unknown,
  initialErrors: ValidationErrors,
): {
  data: UpdateProfileInput | null;
  errors: ValidationErrors;
} {
  const parsed = updateProfileSchema.safeParse(input);
  if (parsed.success && Object.keys(initialErrors).length === 0) {
    return { data: parsed.data, errors: {} };
  }

  const errors: ValidationErrors = { ...initialErrors };
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key !== 'string' || errors[key]) continue;
      errors[key] = issue.message;
    }
  }
  return { data: null, errors };
}

export function DesignerProfileEditor({
  completionError = null,
  initialCompletion,
  initialProfile,
  taxonomy,
  taxonomyError,
}: {
  completionError?: string | null;
  initialCompletion: ProfileCompletionResponse | null;
  initialProfile: CurrentProfileResponse;
  taxonomy: ProfileEditorTaxonomy;
  taxonomyError: string | null;
}) {
  const router = useRouter();
  const initialForm = useMemo(() => profileToForm(initialProfile), [initialProfile]);
  const [form, setForm] = useState<FormState>(() => initialForm);
  const [savedForm, setSavedForm] = useState<FormState>(() => initialForm);
  const [completion, setCompletion] = useState(initialCompletion);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, startSaveTransition] = useTransition();
  const formRevisionRef = useRef(0);
  const isDirty = !formsEqual(form, savedForm);

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    formRevisionRef.current += 1;
    setForm((current) => ({ ...current, [key]: value }));
    const validationKey = key === 'country' ? 'phone' : key;
    setValidationErrors((current) => {
      if (!current[validationKey]) return current;
      const { [validationKey]: _cleared, ...rest } = current;
      return rest;
    });
    setSaveError(null);
    setSaveSuccess(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prepared = formToInput(form, savedForm);
    const validation = collectValidationErrors(prepared.input, prepared.errors);
    setValidationErrors(validation.errors);
    const input = validation.data;
    if (!input || Object.keys(input).length === 0) {
      setSaveError('Please fix the highlighted fields.');
      return;
    }

    const submittedRevision = formRevisionRef.current;
    setSaveError(null);
    setSaveSuccess(false);
    startSaveTransition(async () => {
      try {
        const updated = await updateDesignerProfile(input);
        const serverForm = profileToForm(updated);
        setSavedForm(serverForm);
        if (submittedRevision === formRevisionRef.current) setForm(serverForm);
        setSaveSuccess(true);
        router.refresh();

        try {
          setCompletion(await fetchProfileCompletion());
        } catch {
          // Saving succeeded. Keep the last known score if its separate refresh fails.
        }
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Could not save profile settings.');
      }
    });
  }

  const cityLimitError =
    form.cityIds.length > PROFILE_FOOTPRINT_LIMITS.city
      ? `Select up to ${PROFILE_FOOTPRINT_LIMITS.city} cities.`
      : undefined;
  const scopeLimitError =
    form.scopeIds.length > PROFILE_FOOTPRINT_LIMITS.scope
      ? `Select up to ${PROFILE_FOOTPRINT_LIMITS.scope} services.`
      : undefined;
  const themeLimitError =
    form.themeIds.length > PROFILE_FOOTPRINT_LIMITS.theme
      ? `Select up to ${PROFILE_FOOTPRINT_LIMITS.theme} design themes.`
      : undefined;

  return (
    <form className="grid gap-6" onSubmit={handleSubmit} noValidate>
      {completion ? (
        <Card>
          <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Profile completion</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {completion.missing.length > 0
                  ? `${completion.missing.length} item${completion.missing.length === 1 ? '' : 's'} remaining`
                  : 'Your profile is complete'}
              </p>
            </div>
            <div className="flex min-w-48 items-center gap-3">
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Profile completion"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={completion.score}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${completion.score}%` }}
                />
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {completion.score}% complete
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {completionError ? (
        <Alert variant="warning">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{completionError}</AlertDescription>
        </Alert>
      ) : null}

      {taxonomyError ? (
        <Alert variant="warning">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{taxonomyError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Profile basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex flex-col items-start gap-5 sm:flex-row">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-card shadow-xs">
              <InitialsAvatar
                seed={form.displayName}
                fallbackSeed="Tickif Designer"
                alt="Generated profile initials"
                size={64}
              />
            </div>

            <div className="grid w-full flex-1 gap-4 sm:grid-cols-2">
              <Field
                htmlFor="profile-display-name"
                label="Display name"
                error={validationErrors.displayName}
              >
                {(aria) => (
                  <Input
                    id="profile-display-name"
                    value={form.displayName}
                    onChange={(event) => updateField('displayName', event.target.value)}
                    placeholder="Your Interior Studio"
                    autoComplete="organization"
                    maxLength={100}
                    {...aria}
                  />
                )}
              </Field>

              <SelectField
                id="profile-entity-type"
                error={validationErrors.entityType}
                label="Listing type"
                value={form.entityType}
                onValueChange={(value) => {
                  const parsed = designerEntityType.safeParse(value);
                  if (parsed.success) updateField('entityType', parsed.data);
                }}
                options={entityTypeOptions}
                placeholder="Select listing type"
              />
            </div>
          </div>

          <Field htmlFor="profile-bio" label="Bio" error={validationErrors.bio}>
            {(aria) => (
              <>
                <Textarea
                  id="profile-bio"
                  value={form.bio}
                  onChange={(event) => updateField('bio', event.target.value)}
                  placeholder="Tell homeowners what kind of spaces you love creating."
                  maxLength={500}
                  {...aria}
                />
                <p className="text-right text-xs text-muted-foreground">{form.bio.length}/500</p>
              </>
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact and links</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Field htmlFor="profile-address" label="Address" error={validationErrors.address}>
            {(aria) => (
              <Input
                id="profile-address"
                value={form.address}
                onChange={(event) => updateField('address', event.target.value)}
                placeholder="Studio address or service location"
                autoComplete="street-address"
                maxLength={300}
                {...aria}
              />
            )}
          </Field>

          <Field htmlFor="profile-phone" label="WhatsApp / phone" error={validationErrors.phone}>
            {(aria) => (
              <PhoneNumberInput
                id="profile-phone"
                ariaLabel="WhatsApp / phone"
                phone={form.phone}
                selectedCountry={form.country}
                onPhoneChange={(value) => updateField('phone', value)}
                onSelectedCountryChange={(country) => updateField('country', country)}
                placeholder="9123456789"
                ariaInvalid={aria['aria-invalid']}
                ariaDescribedBy={aria['aria-describedby']}
              />
            )}
          </Field>

          <Field htmlFor="profile-website" label="Website" error={validationErrors.websiteUrl}>
            {(aria) => (
              <Input
                id="profile-website"
                value={form.websiteUrl}
                onChange={(event) => updateField('websiteUrl', event.target.value)}
                placeholder="https://yourstudio.com"
                type="url"
                maxLength={200}
                {...aria}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              htmlFor="profile-instagram"
              label="Instagram"
              error={validationErrors.instagramHandle}
            >
              {(aria) => (
                <Input
                  id="profile-instagram"
                  value={form.instagramHandle}
                  onChange={(event) => updateField('instagramHandle', event.target.value)}
                  placeholder="@yourstudio"
                  maxLength={60}
                  {...aria}
                />
              )}
            </Field>
            <Field
              htmlFor="profile-linkedin"
              label="LinkedIn"
              error={validationErrors.linkedinHandle}
            >
              {(aria) => (
                <Input
                  id="profile-linkedin"
                  value={form.linkedinHandle}
                  onChange={(event) => updateField('linkedinHandle', event.target.value)}
                  placeholder="/company/yourstudio"
                  maxLength={60}
                  {...aria}
                />
              )}
            </Field>
            <Field htmlFor="profile-youtube" label="YouTube" error={validationErrors.youtubeHandle}>
              {(aria) => (
                <Input
                  id="profile-youtube"
                  value={form.youtubeHandle}
                  onChange={(event) => updateField('youtubeHandle', event.target.value)}
                  placeholder="@yourstudio"
                  maxLength={60}
                  {...aria}
                />
              )}
            </Field>
          </div>
        </CardContent>
      </Card>

      {form.entityType === designerEntityType.enum.company ? (
        <Card>
          <CardHeader>
            <CardTitle>Company details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-3">
            <Field htmlFor="profile-firm-type" label="Firm type" error={validationErrors.firmType}>
              {(aria) => (
                <Input
                  id="profile-firm-type"
                  value={form.firmType}
                  onChange={(event) => updateField('firmType', event.target.value)}
                  placeholder="Private Limited, LLP, Studio..."
                  maxLength={60}
                  {...aria}
                />
              )}
            </Field>

            <Field
              htmlFor="profile-founded-year"
              label="Founded year"
              error={validationErrors.foundedYear}
            >
              {(aria) => (
                <Input
                  id="profile-founded-year"
                  value={form.foundedYear}
                  onChange={(event) =>
                    updateField('foundedYear', event.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  placeholder="2021"
                  inputMode="numeric"
                  {...aria}
                />
              )}
            </Field>

            <Field
              htmlFor="profile-staff-count"
              label="Staff count"
              error={validationErrors.staffCount}
            >
              {(aria) => (
                <Input
                  id="profile-staff-count"
                  value={form.staffCount}
                  onChange={(event) =>
                    updateField('staffCount', event.target.value.replace(/\D/g, '').slice(0, 5))
                  }
                  placeholder="10"
                  inputMode="numeric"
                  {...aria}
                />
              )}
            </Field>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Footprint</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <TaxonomyMultiSelect
            id="profile-cities"
            label="Cities"
            limit={PROFILE_FOOTPRINT_LIMITS[PROFILE_TAXONOMY_KIND.CITY]}
            error={validationErrors.cityIds ?? cityLimitError}
            options={taxonomy.cities}
            values={form.cityIds}
            onValuesChange={(values) => updateField('cityIds', values)}
          />
          <TaxonomyMultiSelect
            id="profile-services"
            label="Services"
            limit={PROFILE_FOOTPRINT_LIMITS[PROFILE_TAXONOMY_KIND.SCOPE]}
            error={validationErrors.scopeIds ?? scopeLimitError}
            options={taxonomy.scopes}
            values={form.scopeIds}
            onValuesChange={(values) => updateField('scopeIds', values)}
          />
          <TaxonomyMultiSelect
            id="profile-themes"
            label="Design themes"
            limit={PROFILE_FOOTPRINT_LIMITS[PROFILE_TAXONOMY_KIND.THEME]}
            error={validationErrors.themeIds ?? themeLimitError}
            options={taxonomy.themes}
            values={form.themeIds}
            onValuesChange={(values) => updateField('themeIds', values)}
          />
        </CardContent>
      </Card>

      {saveError ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}
      {saveSuccess ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertDescription>Profile saved.</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <p className="mr-auto text-xs text-muted-foreground">
          {isDirty ? 'You have unsaved changes.' : 'All changes are saved.'}
        </p>
        <Button type="submit" disabled={!isDirty || isSaving} className="sm:min-w-36">
          {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isSaving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
