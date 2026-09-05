'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  personalAccountSchema,
  updatePersonalAccountSchema,
  type PersonalAccount,
} from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
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
    <form
      onSubmit={save}
      className="flex flex-col gap-6"
      aria-label="Personal settings"
      aria-busy={busy}
    >
      <fieldset disabled={busy} className="flex flex-col gap-6">
        <legend className="sr-only">Personal details</legend>
        <FieldGroup>
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
          <Field data-invalid={invalidFields.includes('whatsappNumber')}>
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
              Include the country code, for example +919876543210. This does not change your sign-in
              phone.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </fieldset>
      <section aria-labelledby="sign-in-details" className="flex flex-col gap-3">
        <h2 id="sign-in-details" className="text-sm font-medium">
          Sign-in details
        </h2>
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="break-all">
              {account.email.endsWith('@phone.tickif.local')
                ? 'Not added'
                : `${account.email} (${account.emailVerified ? 'Verified' : 'Unverified'})`}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Phone number</dt>
            <dd>
              {account.phoneNumber
                ? `${account.phoneNumber} (${account.phoneNumberVerified ? 'Verified' : 'Unverified'})`
                : 'Not added'}
            </dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">
          Sign-in email and phone cannot be changed here.
        </p>
      </section>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm">
          Personal settings saved.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy || !dirty || conflict}>
          {busy ? 'Please wait…' : 'Save changes'}
        </Button>
        {conflict ? (
          <Button type="button" variant="outline" disabled={busy} onClick={reloadLatest}>
            Reload latest settings
          </Button>
        ) : null}
      </div>
      {conflict ? (
        <p className="text-sm text-muted-foreground">
          Reloading replaces your unsaved edits with the latest saved settings.
        </p>
      ) : null}
    </form>
  );
}
