'use client';

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, ChevronsUpDown, Loader2 } from 'lucide-react';
import {
  updateProfileSchema,
  type CurrentProfileResponse,
  type ProfileCompletionResponse,
  type ProfileOwnerResponse,
  type TaxonomyTerm,
  type UpdateProfileInput,
} from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import { Textarea } from '@repo/ui/components/textarea';
import { InitialsAvatar } from '@/components/initials-avatar';
import { PhoneNumberInput, countries, type Country } from '@/components/phone-number-input';
import { fetchProfileCompletion, updateDesignerProfile } from '@/lib/profile-editor-api';
import type { ProfileEditorTaxonomy } from '@/lib/profile-editor-types';

const entityTypeOptions = [
  { value: 'individual', label: 'Individual designer' },
  { value: 'company', label: 'Interior company' },
] as const;

type FormState = {
  displayName: string;
  bio: string;
  entityType: 'individual' | 'company';
  address: string;
  countryCode: string;
  phone: string;
  websiteUrl: string;
  googleBusinessUrl: string;
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

function Field({
  children,
  error,
  htmlFor,
  label,
}: {
  children: ReactNode;
  error?: string;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function getCountry(code: string): Country {
  return countries.find((country) => country.code === code) ?? countries[0]!;
}

function splitPhone(value: string | null): { countryCode: string; phone: string } {
  const defaultCountry = countries[0]!;
  if (!value) return { countryCode: defaultCountry.code, phone: '' };

  const normalized = value.startsWith('+') ? value : `+${value.replace(/\D/g, '')}`;
  let match: Country | null = null;
  for (const country of countries) {
    if (
      normalized.startsWith(country.code) &&
      (!match || country.code.length > match.code.length)
    ) {
      match = country;
    }
  }
  const selected = match ?? defaultCountry;
  return {
    countryCode: selected.code,
    phone: normalized.slice(selected.code.length).replace(/\D/g, '').slice(0, 10),
  };
}

function profileToForm(profile: ProfileOwnerResponse): FormState {
  const phone = splitPhone(profile.phone);
  return {
    displayName: profile.displayName,
    bio: profile.bio ?? '',
    entityType: profile.entityType,
    address: profile.address ?? '',
    countryCode: phone.countryCode,
    phone: phone.phone,
    websiteUrl: profile.websiteUrl ?? '',
    googleBusinessUrl: profile.googleBusinessUrl ?? '',
    instagramHandle: profile.instagramHandle ?? '',
    linkedinHandle: profile.linkedinHandle ?? '',
    youtubeHandle: profile.youtubeHandle ?? '',
    firmType: profile.firmType ?? '',
    foundedYear: profile.foundedYear?.toString() ?? '',
    staffCount: profile.staffCount?.toString() ?? '',
    cityIds: profile.footprint.filter((term) => term.kind === 'city').map((term) => term.id),
    scopeIds: profile.footprint.filter((term) => term.kind === 'scope').map((term) => term.id),
    themeIds: profile.footprint.filter((term) => term.kind === 'theme').map((term) => term.id),
  };
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableNumber(value: string): number | null {
  return value ? Number.parseInt(value, 10) : null;
}

function formToInput(form: FormState): UpdateProfileInput {
  const isCompany = form.entityType === 'company';
  return {
    displayName: form.displayName.trim(),
    bio: nullable(form.bio),
    entityType: form.entityType,
    address: nullable(form.address),
    phone: form.phone ? `${form.countryCode}${form.phone}` : null,
    websiteUrl: nullable(form.websiteUrl),
    googleBusinessUrl: nullable(form.googleBusinessUrl),
    instagramHandle: nullable(form.instagramHandle),
    linkedinHandle: nullable(form.linkedinHandle),
    youtubeHandle: nullable(form.youtubeHandle),
    firmType: isCompany ? nullable(form.firmType) : null,
    foundedYear: isCompany ? nullableNumber(form.foundedYear) : null,
    staffCount: isCompany ? nullableNumber(form.staffCount) : null,
    cityIds: form.cityIds,
    scopeIds: form.scopeIds,
    themeIds: form.themeIds,
  };
}

function collectValidationErrors(input: unknown): {
  data: UpdateProfileInput | null;
  errors: ValidationErrors;
} {
  const parsed = updateProfileSchema.safeParse(input);
  if (parsed.success) return { data: parsed.data, errors: {} };

  const errors: ValidationErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key !== 'string' || errors[key]) continue;
    errors[key] =
      key === 'websiteUrl' || key === 'googleBusinessUrl' ? 'Enter a valid URL.' : issue.message;
  }
  return { data: null, errors };
}

function TaxonomyMultiSelect({
  label,
  limit,
  onValuesChange,
  options,
  values,
}: {
  label: string;
  limit: number;
  values: string[];
  options: TaxonomyTerm[];
  onValuesChange: (values: string[]) => void;
}) {
  const selected = options.filter((option) => values.includes(option.id));
  const summary =
    selected.length > 0 ? selected.map((option) => option.label).join(', ') : 'None selected';

  function toggle(optionId: string) {
    onValuesChange(
      values.includes(optionId)
        ? values.filter((value) => value !== optionId)
        : [...values, optionId],
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {values.length}/{limit}
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${label}: ${summary}`}
            className="flex h-10 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-xs outline-none transition-colors hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="min-w-0 truncate">{summary}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
        >
          {options.length > 0 ? (
            options.map((option) => {
              const checked = values.includes(option.id);
              return (
                <DropdownMenuCheckboxItem
                  key={option.id}
                  checked={checked}
                  disabled={!checked && values.length >= limit}
                  onCheckedChange={() => toggle(option.id)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              );
            })
          ) : (
            <div className="px-3 py-5 text-center text-xs text-muted-foreground">
              No options available
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function DesignerProfileEditor({
  initialCompletion,
  initialProfile,
  taxonomy,
  taxonomyError,
}: {
  initialCompletion: ProfileCompletionResponse | null;
  initialProfile: CurrentProfileResponse;
  taxonomy: ProfileEditorTaxonomy;
  taxonomyError: string | null;
}) {
  const router = useRouter();
  const initialForm = profileToForm(initialProfile);
  const [form, setForm] = useState<FormState>(initialForm);
  const [savedForm, setSavedForm] = useState<FormState>(initialForm);
  const [completion, setCompletion] = useState(initialCompletion);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, startSaveTransition] = useTransition();
  const formRevisionRef = useRef(0);
  const isDirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    formRevisionRef.current += 1;
    setForm((current) => ({ ...current, [key]: value }));
    setValidationErrors({});
    setSaveError(null);
    setSaveSuccess(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = collectValidationErrors(formToInput(form));
    setValidationErrors(validation.errors);
    const input = validation.data;
    if (!input) return;

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

  const selectedCountry = getCountry(form.countryCode);

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
                <Input
                  id="profile-display-name"
                  value={form.displayName}
                  onChange={(event) => updateField('displayName', event.target.value)}
                  placeholder="Your Interior Studio"
                  autoComplete="organization"
                  maxLength={100}
                  aria-invalid={!!validationErrors.displayName}
                  aria-describedby={
                    validationErrors.displayName ? 'profile-display-name-error' : undefined
                  }
                />
              </Field>

              <SelectField
                id="profile-entity-type"
                label="Listing type"
                value={form.entityType}
                onValueChange={(value) =>
                  updateField('entityType', value as FormState['entityType'])
                }
                options={entityTypeOptions}
                placeholder="Select listing type"
              />
            </div>
          </div>

          <Field htmlFor="profile-bio" label="Bio" error={validationErrors.bio}>
            <Textarea
              id="profile-bio"
              value={form.bio}
              onChange={(event) => updateField('bio', event.target.value)}
              placeholder="Tell homeowners what kind of spaces you love creating."
              maxLength={500}
              aria-invalid={!!validationErrors.bio}
              aria-describedby={validationErrors.bio ? 'profile-bio-error' : undefined}
            />
            <p className="text-right text-xs text-muted-foreground">{form.bio.length}/500</p>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact and links</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Field htmlFor="profile-address" label="Address" error={validationErrors.address}>
            <Input
              id="profile-address"
              value={form.address}
              onChange={(event) => updateField('address', event.target.value)}
              placeholder="Studio address or service location"
              autoComplete="street-address"
              maxLength={300}
              aria-invalid={!!validationErrors.address}
              aria-describedby={validationErrors.address ? 'profile-address-error' : undefined}
            />
          </Field>

          <Field htmlFor="profile-phone" label="WhatsApp / phone" error={validationErrors.phone}>
            <PhoneNumberInput
              id="profile-phone"
              phone={form.phone}
              selectedCountry={selectedCountry}
              onPhoneChange={(value) => updateField('phone', value)}
              onSelectedCountryChange={(country) => updateField('countryCode', country.code)}
              placeholder="9123456789"
              disabled={isSaving}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="profile-website" label="Website" error={validationErrors.websiteUrl}>
              <Input
                id="profile-website"
                value={form.websiteUrl}
                onChange={(event) => updateField('websiteUrl', event.target.value)}
                placeholder="https://yourstudio.com"
                type="url"
                maxLength={200}
                aria-invalid={!!validationErrors.websiteUrl}
                aria-describedby={validationErrors.websiteUrl ? 'profile-website-error' : undefined}
              />
            </Field>

            <Field
              htmlFor="profile-google-business"
              label="Google Business URL"
              error={validationErrors.googleBusinessUrl}
            >
              <Input
                id="profile-google-business"
                value={form.googleBusinessUrl}
                onChange={(event) => updateField('googleBusinessUrl', event.target.value)}
                placeholder="https://g.page/yourstudio"
                type="url"
                maxLength={200}
                aria-invalid={!!validationErrors.googleBusinessUrl}
                aria-describedby={
                  validationErrors.googleBusinessUrl ? 'profile-google-business-error' : undefined
                }
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              htmlFor="profile-instagram"
              label="Instagram"
              error={validationErrors.instagramHandle}
            >
              <Input
                id="profile-instagram"
                value={form.instagramHandle}
                onChange={(event) => updateField('instagramHandle', event.target.value)}
                placeholder="@yourstudio"
                maxLength={60}
              />
            </Field>
            <Field
              htmlFor="profile-linkedin"
              label="LinkedIn"
              error={validationErrors.linkedinHandle}
            >
              <Input
                id="profile-linkedin"
                value={form.linkedinHandle}
                onChange={(event) => updateField('linkedinHandle', event.target.value)}
                placeholder="/company/yourstudio"
                maxLength={60}
              />
            </Field>
            <Field htmlFor="profile-youtube" label="YouTube" error={validationErrors.youtubeHandle}>
              <Input
                id="profile-youtube"
                value={form.youtubeHandle}
                onChange={(event) => updateField('youtubeHandle', event.target.value)}
                placeholder="@yourstudio"
                maxLength={60}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {form.entityType === 'company' ? (
        <Card>
          <CardHeader>
            <CardTitle>Company details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-3">
            <Field htmlFor="profile-firm-type" label="Firm type" error={validationErrors.firmType}>
              <Input
                id="profile-firm-type"
                value={form.firmType}
                onChange={(event) => updateField('firmType', event.target.value)}
                placeholder="Private Limited, LLP, Studio..."
                maxLength={60}
              />
            </Field>

            <Field
              htmlFor="profile-founded-year"
              label="Founded year"
              error={validationErrors.foundedYear}
            >
              <Input
                id="profile-founded-year"
                value={form.foundedYear}
                onChange={(event) =>
                  updateField('foundedYear', event.target.value.replace(/\D/g, '').slice(0, 4))
                }
                placeholder="2021"
                inputMode="numeric"
              />
            </Field>

            <Field
              htmlFor="profile-staff-count"
              label="Staff count"
              error={validationErrors.staffCount}
            >
              <Input
                id="profile-staff-count"
                value={form.staffCount}
                onChange={(event) =>
                  updateField('staffCount', event.target.value.replace(/\D/g, '').slice(0, 5))
                }
                placeholder="10"
                inputMode="numeric"
              />
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
            label="Cities"
            limit={5}
            options={taxonomy.cities}
            values={form.cityIds}
            onValuesChange={(values) => updateField('cityIds', values)}
          />
          <TaxonomyMultiSelect
            label="Services"
            limit={10}
            options={taxonomy.scopes}
            values={form.scopeIds}
            onValuesChange={(values) => updateField('scopeIds', values)}
          />
          <TaxonomyMultiSelect
            label="Design themes"
            limit={10}
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
