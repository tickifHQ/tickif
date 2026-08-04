'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import { Checkbox } from '@repo/ui/components/checkbox';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { InitialsAvatar } from '@/components/initials-avatar';
import { authClient } from '@/lib/auth-client';
import { saveVisitorOnboardingPreferences } from '@/lib/visitor-onboarding';

type VisitorOnboardingFormProps = {
  displayName: string;
  signedInAs: string;
  initialPhoneNumber: string;
};

export function VisitorOnboardingForm({
  displayName: initialDisplayName,
  initialPhoneNumber,
  signedInAs,
}: VisitorOnboardingFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [whatsapp, setWhatsapp] = useState('');
  const [usePhoneForWhatsapp, setUsePhoneForWhatsapp] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedDisplayName = displayName.trim();
    if (normalizedDisplayName.length < 2 || normalizedDisplayName.length > 100) {
      setError('Enter a display name between 2 and 100 characters');
      return;
    }

    setError('');
    setIsSaving(true);
    try {
      const { error: updateError } = await authClient.updateUser({
        name: normalizedDisplayName,
      });
      if (updateError) {
        setError(updateError.message || 'Could not save your name. Please try again.');
        return;
      }

      saveVisitorOnboardingPreferences({
        displayName: normalizedDisplayName,
        address: address.trim(),
        phoneNumber: phoneNumber.trim(),
        whatsapp: (usePhoneForWhatsapp ? phoneNumber : whatsapp).trim(),
      });
      router.push('/');
      router.refresh();
    } catch {
      setError('Could not save your name. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleUsePhoneForWhatsappChange(checked: boolean) {
    setWhatsapp(phoneNumber);
    setUsePhoneForWhatsapp(checked);
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
          <div className="aspect-square self-stretch shrink-0 overflow-hidden rounded-lg border border-border bg-card shadow-xs">
            <InitialsAvatar
              seed={displayName}
              fallbackSeed="Your name"
              alt="Generated visitor initials"
              size={64}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="visitor-display-name" className="text-sm font-medium">
              Display name
            </Label>
            <Input
              id="visitor-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Your name"
              required
              minLength={2}
              maxLength={100}
            />
          </div>
        </div>

        <div className="grid gap-1">
          <Label htmlFor="visitor-address" className="text-[13px] font-medium leading-relaxed">
            Address
          </Label>
          <Input
            id="visitor-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Address or locality"
            autoComplete="street-address"
            maxLength={300}
            className="h-8 rounded-md px-2 text-[13px]"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="visitor-phone-number" className="text-sm font-medium">
            Phone number
          </Label>
          <Input
            id="visitor-phone-number"
            type="tel"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="+91 9123456789"
            autoComplete="tel"
            readOnly={Boolean(initialPhoneNumber)}
            className="read-only:cursor-default read-only:bg-muted read-only:text-muted-foreground"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="visitor-whatsapp" className="text-sm font-medium">
            WhatsApp number <span className="font-normal text-muted-foreground">(Recommended)</span>
          </Label>
          <Input
            id="visitor-whatsapp"
            type="tel"
            value={usePhoneForWhatsapp ? phoneNumber : whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
            placeholder="+91 9123456789"
            autoComplete="tel"
            disabled={usePhoneForWhatsapp}
          />
          <div className="flex items-center gap-2.5 pt-1">
            <Checkbox
              id="visitor-use-phone-for-whatsapp"
              checked={usePhoneForWhatsapp}
              onCheckedChange={(checked) => handleUsePhoneForWhatsappChange(checked === true)}
            />
            <Label
              htmlFor="visitor-use-phone-for-whatsapp"
              className="cursor-pointer text-sm font-normal"
            >
              Use phone number for WhatsApp
            </Label>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="h-11 w-full" disabled={isSaving}>
            {isSaving ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                Saving
              </>
            ) : (
              <>
                Continue
                <ChevronRight className="size-4" />
              </>
            )}
          </Button>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>Need help?</span>
            <Link
              href="mailto:support@tickif.in"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Contact support
            </Link>
            <span>|</span>
            <Link
              href="/"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Skip
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
