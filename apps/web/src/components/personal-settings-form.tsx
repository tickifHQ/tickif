'use client';

import { useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  personalAccountSchema,
  updatePersonalAccountSchema,
  type PersonalAccount,
} from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/card';
import { Input } from '@repo/ui/components/input';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@repo/ui/components/field';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { readApiErrorMessage } from '@/lib/api-response';

export function PersonalSettingsForm({ initialAccount }: { initialAccount: PersonalAccount }) {
  const router = useRouter();
  const [account, setAccount] = useState(initialAccount);
  const [name, setName] = useState(initialAccount.name);
  const [address, setAddress] = useState(initialAccount.address ?? '');
  const [whatsappNumber, setWhatsappNumber] = useState(initialAccount.whatsappNumber ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const dirty =
    name !== account.name ||
    address !== (account.address ?? '') ||
    whatsappNumber !== (account.whatsappNumber ?? '');

  function acceptAccount(value: PersonalAccount) {
    setAccount(value);
    setName(value.name);
    setAddress(value.address ?? '');
    setWhatsappNumber(value.whatsappNumber ?? '');
    setInvalidFields([]);
    setConflict(false);
  }

  async function reloadLatest() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const response = await api.api['personal-account'].me.$get(
        {},
        { init: { cache: 'no-store' } },
      );
      if (!response.ok) {
        setError(await readApiErrorMessage(response, 'Could not reload your settings.'));
        return;
      }
      const parsed = personalAccountSchema.safeParse(await response.json());
      if (!parsed.success) {
        setError('Could not reload your settings.');
        return;
      }
      acceptAccount(parsed.data);
    } catch {
      setError('Could not reload your settings. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || conflict) return;
    setSaved(false);
    setError('');
    const input = updatePersonalAccountSchema.safeParse({
      name,
      address: address.trim() || null,
      whatsappNumber: whatsappNumber.trim() || null,
      revision: account.revision,
    });
    if (!input.success) {
      setInvalidFields(input.error.issues.map((issue) => String(issue.path[0])));
      setError(
        'Enter a name between 2 and 100 characters, an address up to 300 characters, and a WhatsApp number with country code (for example +919876543210). Optional fields can be left blank.',
      );
      return;
    }
    setInvalidFields([]);
    setBusy(true);
    try {
      const response = await api.api['personal-account'].me.$patch({ json: input.data });
      if (!response.ok) {
        setConflict(response.status === 409);
        setError(
          await readApiErrorMessage(response, 'Could not save your settings. Please try again.'),
        );
        return;
      }
      const parsed = personalAccountSchema.safeParse(await response.json());
      if (!parsed.success) {
        setError('Could not confirm your save. Reload the latest settings before retrying.');
        setConflict(true);
        return;
      }
      acceptAccount(parsed.data);
      setSaved(true);
      // The account name is also rendered by session consumers in the header.
      await authClient.getSession({ query: { disableCookieCache: true } }).catch(() => undefined);
      router.refresh();
    } catch {
      setError('Could not confirm your save. Your changes are still here. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-6" aria-label="Personal settings" aria-busy={busy}>
      <fieldset disabled={busy} className="grid gap-6">
        <legend className="sr-only">Personal details</legend>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Personal details</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={invalidFields.includes('name')}>
                <FieldLabel htmlFor="personal-name">Display name</FieldLabel>
                <Input
                  id="personal-name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                  value={name}
                  aria-invalid={invalidFields.includes('name')}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSaved(false);
                  }}
                />
              </Field>
              <Field data-invalid={invalidFields.includes('address')}>
                <FieldLabel htmlFor="personal-address">Personal address (optional)</FieldLabel>
                <Input
                  id="personal-address"
                  autoComplete="street-address"
                  maxLength={300}
                  value={address}
                  aria-invalid={invalidFields.includes('address')}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setSaved(false);
                  }}
                />
              </Field>
              <Field
                className="sm:col-span-2"
                data-invalid={invalidFields.includes('whatsappNumber')}
              >
                <FieldLabel htmlFor="personal-whatsapp">WhatsApp number (optional)</FieldLabel>
                <Input
                  id="personal-whatsapp"
                  type="tel"
                  autoComplete="tel"
                  maxLength={16}
                  value={whatsappNumber}
                  aria-invalid={invalidFields.includes('whatsappNumber')}
                  aria-describedby="whatsapp-help"
                  onChange={(e) => {
                    setWhatsappNumber(e.target.value);
                    setSaved(false);
                  }}
                />
                <FieldDescription id="whatsapp-help">
                  Include the country code, for example +919876543210. This does not change your
                  sign-in phone.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </fieldset>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id="sign-in-details">Sign-in details</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <dl className="grid gap-5 text-sm sm:grid-cols-2">
            <div className="grid min-w-0 gap-2">
              <dt className="font-medium">Email</dt>
              <dd className="flex min-h-10 items-center rounded-md border border-input bg-muted/30 px-3 py-2 text-muted-foreground shadow-xs break-all">
                {account.email.endsWith('@phone.tickif.local')
                  ? 'Not added'
                  : `${account.email} (${account.emailVerified ? 'Verified' : 'Unverified'})`}
              </dd>
            </div>
            <div className="grid min-w-0 gap-2">
              <dt className="font-medium">Phone number</dt>
              <dd className="flex min-h-10 items-center rounded-md border border-input bg-muted/30 px-3 py-2 text-muted-foreground shadow-xs break-all">
                {account.phoneNumber
                  ? `${account.phoneNumber} (${account.phoneNumberVerified ? 'Verified' : 'Unverified'})`
                  : 'Not added'}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            Sign-in email and phone cannot be changed here.
          </p>
        </CardContent>
      </Card>
      {error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {saved ? (
        <Alert variant="success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <AlertDescription>Personal settings saved.</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <p className="mr-auto text-xs text-muted-foreground">
          {dirty ? 'You have unsaved changes.' : 'All changes are saved.'}
        </p>
        {conflict ? (
          <Button type="button" variant="outline" disabled={busy} onClick={reloadLatest}>
            Reload latest settings
          </Button>
        ) : null}
        <Button type="submit" disabled={busy || !dirty || conflict} className="sm:min-w-36">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {busy ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
      {conflict ? (
        <p className="text-sm text-muted-foreground">
          Reloading replaces your unsaved edits with the latest saved settings.
        </p>
      ) : null}
    </form>
  );
}
