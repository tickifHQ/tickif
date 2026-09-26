'use client';

import { useMemo, useState } from 'react';
import { MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  experienceCenterSchema,
  MAX_EXPERIENCE_CENTERS,
  type ExperienceCenter,
} from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';

/**
 * Indian States and Union Territories, used for the Experience Center state
 * dropdown. The selected value is stored as-is in the free-text `state` field
 * on the existing contract — this is a UI convenience, not a schema change.
 */
const INDIAN_STATES_AND_UTS = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

const STATE_OPTIONS = INDIAN_STATES_AND_UTS.map((state) => ({ label: state, value: state }));

/**
 * Experience Centers editor (Notion Feedback: Experience Centers — frontend).
 *
 * The backend stores a flat `ExperienceCenter[]` on the portfolio and the
 * public page groups them by state (`experienceCenterGroups`). This editor
 * mirrors that: it edits the flat array (add / edit / remove) and hands the
 * whole array back through `onChange` so the existing portfolio update flow
 * (`updatePortfolio`) persists it. Grouping by state here is presentation only,
 * derived from the data — no separate state taxonomy is introduced.
 */

type DraftForm = {
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  mapsUrl: string;
};

type FieldErrors = Partial<Record<keyof DraftForm, string>>;

const EMPTY_DRAFT: DraftForm = {
  name: '',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  phone: '',
  mapsUrl: '',
};

function centerToDraft(center: ExperienceCenter): DraftForm {
  return {
    name: center.name,
    address: center.address,
    city: center.city,
    state: center.state,
    postalCode: center.postalCode ?? '',
    phone: center.phone ?? '',
    mapsUrl: center.mapsUrl ?? '',
  };
}

/** Trim + coerce a draft into the contract shape (optional blanks become null). */
function draftToCandidate(draft: DraftForm): Record<string, unknown> {
  const optional = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  return {
    name: draft.name.trim(),
    address: draft.address.trim(),
    city: draft.city.trim(),
    state: draft.state.trim(),
    postalCode: optional(draft.postalCode),
    phone: optional(draft.phone),
    mapsUrl: optional(draft.mapsUrl),
  };
}

/**
 * Group centers by their `state`, matching the public page's grouping. States
 * are ordered alphabetically; centers keep their insertion order within a
 * state. Nothing is hard-coded — every group is derived from the data.
 */
export function groupExperienceCentersByState(
  centers: ExperienceCenter[],
): Array<{ state: string; centers: ExperienceCenter[] }> {
  const byState = new Map<string, ExperienceCenter[]>();
  for (const center of centers) {
    const group = byState.get(center.state) ?? [];
    group.push(center);
    byState.set(center.state, group);
  }
  return Array.from(byState.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([state, group]) => ({ state, centers: group }));
}

export function ExperienceCentersEditor({
  value,
  onChange,
}: {
  value: ExperienceCenter[];
  onChange: (centers: ExperienceCenter[]) => void;
}) {
  // `null` = closed, `'new'` = adding, number = editing that index.
  const [editing, setEditing] = useState<'new' | number | null>(null);
  const [draft, setDraft] = useState<DraftForm>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<FieldErrors>({});

  const groups = useMemo(() => groupExperienceCentersByState(value), [value]);
  const atLimit = value.length >= MAX_EXPERIENCE_CENTERS;
  const stateOptions =
    draft.state && !STATE_OPTIONS.some((option) => option.value === draft.state)
      ? [{ label: draft.state, value: draft.state }, ...STATE_OPTIONS]
      : STATE_OPTIONS;

  function openAdd() {
    if (atLimit) return;
    setDraft(EMPTY_DRAFT);
    setErrors({});
    setEditing('new');
  }

  function openEdit(index: number) {
    const center = value[index];
    if (!center) return;
    setDraft(centerToDraft(center));
    setErrors({});
    setEditing(index);
  }

  function closeForm() {
    setEditing(null);
    setErrors({});
    setDraft(EMPTY_DRAFT);
  }

  function updateDraft<K extends keyof DraftForm>(key: K, next: string) {
    setDraft((prev) => ({ ...prev, [key]: next }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _cleared, ...rest } = prev;
      return rest;
    });
  }

  function removeCenter(index: number) {
    onChange(value.filter((_, position) => position !== index));
    if (editing === index) closeForm();
    else if (typeof editing === 'number' && index < editing) setEditing(editing - 1);
  }

  function saveDraft() {
    const parsed = experienceCenterSchema.safeParse(draftToCandidate(draft));
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && key in EMPTY_DRAFT && !nextErrors[key as keyof DraftForm]) {
          nextErrors[key as keyof DraftForm] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    const center = parsed.data;
    if (editing === 'new') {
      if (atLimit) return;
      onChange([...value, center]);
    } else if (typeof editing === 'number') {
      onChange(value.map((existing, position) => (position === editing ? center : existing)));
    }
    closeForm();
  }

  const editorForm =
    editing !== null ? (
      <div
        className="space-y-4 rounded-lg border border-border bg-background p-4"
        data-slot="experience-center-form"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">
            {editing === 'new' ? 'Add experience center' : 'Edit experience center'}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Cancel"
            onClick={closeForm}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ExperienceCenterField
            id="ec-name"
            label="Name"
            value={draft.name}
            onChange={(v) => updateDraft('name', v)}
            placeholder="Whitefield Experience Center"
            error={errors.name}
            maxLength={120}
          />
          <ExperienceCenterField
            id="ec-city"
            label="City"
            value={draft.city}
            onChange={(v) => updateDraft('city', v)}
            placeholder="Bengaluru"
            error={errors.city}
            maxLength={100}
          />
        </div>

        <ExperienceCenterField
          id="ec-address"
          label="Address"
          value={draft.address}
          onChange={(v) => updateDraft('address', v)}
          placeholder="12, 1st Main Road, Whitefield"
          error={errors.address}
          maxLength={300}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="ec-state"
            label="State"
            value={draft.state}
            onValueChange={(v) => updateDraft('state', v)}
            options={stateOptions}
            placeholder="Select a state"
            error={errors.state}
          />
          <ExperienceCenterField
            id="ec-postal-code"
            label="Postal code (optional)"
            value={draft.postalCode}
            onChange={(v) => updateDraft('postalCode', v)}
            placeholder="560066"
            error={errors.postalCode}
            maxLength={20}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ExperienceCenterField
            id="ec-phone"
            label="Phone (optional)"
            value={draft.phone}
            onChange={(v) => updateDraft('phone', v)}
            placeholder="9994645911"
            error={errors.phone}
            maxLength={20}
          />
          <ExperienceCenterField
            id="ec-maps-url"
            label="Google Maps link (optional)"
            value={draft.mapsUrl}
            onChange={(v) => updateDraft('mapsUrl', v)}
            placeholder="https://maps.google.com/..."
            error={errors.mapsUrl}
            type="url"
            maxLength={500}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={closeForm}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={saveDraft}>
            {editing === 'new' ? 'Add center' : 'Save center'}
          </Button>
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-4" data-slot="experience-centers-editor">
      {value.length === 0 && editing !== 'new' ? (
        <div
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center"
          data-testid="experience-centers-empty"
        >
          <MapPin className="size-5 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">No experience centers yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Add your physical experience centers so visitors can find them. They&rsquo;ll appear
            grouped by state on your public page.
          </p>
        </div>
      ) : null}

      {groups.length > 0 ? (
        <ul className="space-y-4" aria-label="Experience centers by state">
          {groups.map((group) => (
            <li key={group.state} data-slot="experience-center-state-group">
              <h4
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                data-slot="experience-center-state"
              >
                {group.state}
              </h4>
              <ul className="mt-2 space-y-2">
                {group.centers.map((center) => {
                  // Map back to the flat-array index for edit/remove targeting.
                  const index = value.indexOf(center);
                  if (editing === index) {
                    return (
                      <li key={index} data-slot="experience-center-item" data-editing="true">
                        {editorForm}
                      </li>
                    );
                  }
                  return (
                    <li
                      key={index}
                      data-slot="experience-center-item"
                      className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {center.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[center.address, center.city, center.postalCode]
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                        {center.phone ? (
                          <p className="text-xs text-muted-foreground">{center.phone}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Edit ${center.name}`}
                          onClick={() => openEdit(index)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          aria-label={`Remove ${center.name}`}
                          onClick={() => removeCenter(index)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}

      {editing === 'new' ? (
        editorForm
      ) : editing === null ? (
        <Button type="button" variant="outline" size="sm" onClick={openAdd} disabled={atLimit}>
          <Plus className="size-4" />
          Add experience center
        </Button>
      ) : null}
      {atLimit ? (
        <p className="text-xs text-muted-foreground">
          You can add up to {MAX_EXPERIENCE_CENTERS} experience centers.
        </p>
      ) : null}
    </div>
  );
}

function ExperienceCenterField({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  type = 'text',
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  type?: 'text' | 'url';
  maxLength?: number;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
