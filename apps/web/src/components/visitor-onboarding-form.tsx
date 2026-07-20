'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import { saveVisitorOnboardingPreferences } from '@/lib/visitor-onboarding';

type VisitorOnboardingFormProps = {
  displayName: string;
  signedInAs: string;
  initials: string;
};

const cityOptions = [
  { value: 'chennai', label: 'Chennai' },
  { value: 'bengaluru', label: 'Bengaluru' },
  { value: 'mumbai', label: 'Mumbai' },
  { value: 'pune', label: 'Pune' },
] as const;

export function VisitorOnboardingForm({
  displayName: initialDisplayName,
  initials,
  signedInAs,
}: VisitorOnboardingFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [city, setCity] = useState<(typeof cityOptions)[number]['value']>('chennai');
  const [whatsapp, setWhatsapp] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveVisitorOnboardingPreferences({
      displayName: displayName.trim() || initialDisplayName,
      city,
      whatsapp: whatsapp.replace(/\D/g, ''),
    });
    router.push('/');
  }

  return (
    <div className="w-full max-w-[450px]">
      <div className="mb-8">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ChevronLeft className="size-4" />
          <span>Signed in as {signedInAs}</span>
        </div>
        <h1 className="mt-2 font-display text-xl font-semibold tracking-tight text-foreground">
          Let&apos;s set up your space on Tickif
        </h1>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="flex gap-5">
          <div className="relative flex size-[60px] shrink-0 items-center justify-center rounded-lg border border-border bg-primary/10 text-lg font-semibold text-primary">
            {initials}
            <span className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full border border-border bg-background text-[10px] text-muted-foreground">
              x
            </span>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="visitor-display-name" className="text-sm font-medium">
              Display name
            </Label>
            <Input
              id="visitor-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
        </div>

        <SelectField
          label="City"
          value={city}
          onValueChange={(value) => setCity(value as typeof city)}
          options={cityOptions}
          placeholder="Select city"
        />

        <div className="space-y-1.5">
          <Label htmlFor="visitor-whatsapp" className="text-sm font-medium">
            WhatsApp number <span className="font-normal text-muted-foreground">(Recommended)</span>
          </Label>
          <div className="flex">
            <div className="inline-flex h-10 items-center gap-2 rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
              <span>IN</span>
              <span>+91</span>
            </div>
            <Input
              id="visitor-whatsapp"
              type="tel"
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
              placeholder="9123456789"
              className="-ml-px rounded-l-none"
            />
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <Button type="submit" className="h-11 w-full">
            Continue
            <ChevronRight className="size-4" />
          </Button>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>Need help?</span>
            <Link href="mailto:support@tickif.in" className="font-medium text-foreground underline-offset-2 hover:underline">
              Contact support
            </Link>
            <span>|</span>
            <Link href="/" className="font-medium text-foreground underline-offset-2 hover:underline">
              Skip to dashboard
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
