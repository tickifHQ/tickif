'use client';

import { useState, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/card';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import { Textarea } from '@repo/ui/components/textarea';
import { InitialsAvatar } from '@/components/initials-avatar';
import { PhoneNumberInput, countries } from '@/components/phone-number-input';

const firmTypeOptions = ['Private Limited', 'LLP', 'Partnership', 'Proprietorship', 'Studio'] as const;
const entityTypeOptions = [
  { value: 'individual', label: 'Individual designer' },
  { value: 'company', label: 'Interior company' },
] as const;
type FirmTypeOption = (typeof firmTypeOptions)[number];
type EntityTypeOption = (typeof entityTypeOptions)[number]['value'];

const placeholderTaxonomy = {
  cities: ['Mumbai', 'Delhi NCR', 'Bengaluru'],
  services: ['Full Home Interiors', 'Modular Kitchen', 'Renovation'],
  themes: ['Modern', 'Contemporary', 'Traditional'],
} as const;

function Field({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function TaxonomyPreview({
  label,
  values,
}: {
  label: string;
  values: readonly string[];
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2 rounded-md border border-dashed bg-muted/30 p-3">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DesignerProfileEditorPlaceholder() {
  const [displayName, setDisplayName] = useState('Your Interior Studio');
  const [bio, setBio] = useState('');
  const [entityType, setEntityType] = useState<EntityTypeOption>('individual');
  const [address, setAddress] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(countries[0]!);
  const [phone, setPhone] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [googleBusinessUrl, setGoogleBusinessUrl] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [linkedinHandle, setLinkedinHandle] = useState('');
  const [youtubeHandle, setYoutubeHandle] = useState('');
  const [firmType, setFirmType] = useState<FirmTypeOption>('Studio');
  const [foundedYear, setFoundedYear] = useState('');
  const [staffCount, setStaffCount] = useState('');

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex items-start gap-5">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-card shadow-xs">
              <InitialsAvatar
                seed={displayName}
                fallbackSeed="Tickif Designer"
                alt="Generated profile initials"
                size={64}
              />
            </div>

            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <Field htmlFor="profile-display-name" label="Display name">
                <Input
                  id="profile-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your Interior Studio"
                  autoComplete="organization"
                />
              </Field>

              <SelectField
                label="Listing type"
                value={entityType}
                onValueChange={(value) => setEntityType(value as EntityTypeOption)}
                options={entityTypeOptions}
                placeholder="Select listing type"
              />
            </div>
          </div>

          <Field htmlFor="profile-bio" label="Bio">
            <Textarea
              id="profile-bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              placeholder="Tell homeowners what kind of spaces you love creating."
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact and links</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Field htmlFor="profile-address" label="Address">
            <Input
              id="profile-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Studio address or service location"
              autoComplete="street-address"
            />
          </Field>

          <div className="grid gap-2">
            <Label htmlFor="profile-phone">WhatsApp / phone</Label>
            <PhoneNumberInput
              id="profile-phone"
              phone={phone}
              selectedCountry={selectedCountry}
              onPhoneChange={setPhone}
              onSelectedCountryChange={setSelectedCountry}
              placeholder="9123456789"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="profile-website" label="Website">
              <Input
                id="profile-website"
                value={websiteUrl}
                onChange={(event) => setWebsiteUrl(event.target.value)}
                placeholder="https://yourstudio.com"
                type="url"
              />
            </Field>

            <Field htmlFor="profile-google-business" label="Google Business URL">
              <Input
                id="profile-google-business"
                value={googleBusinessUrl}
                onChange={(event) => setGoogleBusinessUrl(event.target.value)}
                placeholder="https://g.page/yourstudio"
                type="url"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field htmlFor="profile-instagram" label="Instagram">
              <Input
                id="profile-instagram"
                value={instagramHandle}
                onChange={(event) => setInstagramHandle(event.target.value)}
                placeholder="@yourstudio"
              />
            </Field>
            <Field htmlFor="profile-linkedin" label="LinkedIn">
              <Input
                id="profile-linkedin"
                value={linkedinHandle}
                onChange={(event) => setLinkedinHandle(event.target.value)}
                placeholder="/company/yourstudio"
              />
            </Field>
            <Field htmlFor="profile-youtube" label="YouTube">
              <Input
                id="profile-youtube"
                value={youtubeHandle}
                onChange={(event) => setYoutubeHandle(event.target.value)}
                placeholder="@yourstudio"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {entityType === 'company' ? (
        <Card>
          <CardHeader>
            <CardTitle>Company details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-3">
            <SelectField
              label="Firm type"
              value={firmType}
              onValueChange={(value) => setFirmType(value as FirmTypeOption)}
              options={firmTypeOptions.map((option) => ({ label: option, value: option }))}
              placeholder="Select firm type"
            />

            <Field htmlFor="profile-founded-year" label="Founded year">
              <Input
                id="profile-founded-year"
                value={foundedYear}
                onChange={(event) => setFoundedYear(event.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="2021"
                inputMode="numeric"
              />
            </Field>

            <Field htmlFor="profile-staff-count" label="Staff count">
              <Input
                id="profile-staff-count"
                value={staffCount}
                onChange={(event) => setStaffCount(event.target.value.replace(/\D/g, '').slice(0, 5))}
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
          <TaxonomyPreview label="Cities" values={placeholderTaxonomy.cities} />
          <TaxonomyPreview label="Services" values={placeholderTaxonomy.services} />
          <TaxonomyPreview label="Design themes" values={placeholderTaxonomy.themes} />
        </CardContent>
      </Card>
    </div>
  );
}
