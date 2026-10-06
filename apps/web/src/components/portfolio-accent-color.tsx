'use client';

import { useId, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { portfolioAccentStyle, validPortfolioAccent } from '@/lib/portfolio-accent';

const accentColors = [
  { name: 'Coral red', hex: '#FF8F73' },
  { name: 'Ocean blue', hex: '#4A90D9' },
  { name: 'Forest green', hex: '#2D8659' },
  { name: 'Sunset orange', hex: '#F5A623' },
  { name: 'Lavender', hex: '#9B59B6' },
  { name: 'Slate grey', hex: '#6B7B8D' },
  { name: 'Mint', hex: '#50C9A8' },
  { name: 'Rose pink', hex: '#E84393' },
];

/** Keep a local preview while resetting it on presets and editor discard. */
export function PortfolioAccentColor({
  value,
  onChange,
  disabled = false,
  resetVersion = 0,
}: {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  resetVersion?: number;
}) {
  const id = useId();
  const applied = validPortfolioAccent(value) ?? accentColors[0]!.hex;
  const [draftState, setDraftState] = useState({ applied, resetVersion, text: applied });
  const draft =
    draftState.applied === applied && draftState.resetVersion === resetVersion
      ? draftState.text
      : applied;
  function setDraft(text: string) {
    setDraftState({ applied, resetVersion, text });
  }
  const validDraft = validPortfolioAccent(draft);
  const hasChange = draft !== applied;
  const invalid = !validDraft;
  const preview = validDraft ?? applied;
  const selected = accentColors.find((color) => color.hex === applied) ?? {
    name: 'Custom',
    hex: applied,
  };

  function apply() {
    if (validDraft && !disabled) onChange(validDraft);
  }

  return (
    <div className="space-y-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          aria-label="Accent colour preset"
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2.5 shadow-md transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="size-5 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: selected.hex }}
            />
            <span className="text-sm font-medium text-foreground">{selected.name}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selected.hex}</span>
            <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={4}
          className="w-[var(--radix-dropdown-menu-trigger-width)]"
        >
          {accentColors.map((color) => (
            <DropdownMenuItem
              key={color.hex}
              onSelect={() => {
                setDraft(color.hex);
                onChange(color.hex);
              }}
              className={`justify-between px-3 py-2 ${color.hex === applied ? 'bg-accent/30' : ''}`}
            >
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="size-5 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: color.hex }}
                />
                <span className="text-sm text-foreground">{color.name}</span>
              </span>
              <span className="text-xs text-muted-foreground">{color.hex}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="space-y-1.5">
        <Label htmlFor={id}>Custom accent hex</Label>
        <div className="flex items-center gap-2">
          <Input
            id={id}
            value={draft}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={invalid}
            aria-describedby={`${id}-help${invalid ? ` ${id}-error` : ''}`}
            placeholder="#123ABC"
            className="min-w-0 flex-1 font-mono"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                apply();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraft(applied);
              }
            }}
          />
          <input
            type="color"
            aria-label="Choose custom accent colour"
            disabled={disabled}
            value={preview}
            onChange={(event) => setDraft(event.target.value)}
            className="size-11 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          Use a # followed by six letters or numbers (0–9, A–F).
        </p>
        {invalid ? (
          <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
            Enter a six-digit hex colour, such as #123ABC.
          </p>
        ) : null}
      </div>
      <section
        aria-label="Accent colour preview"
        style={portfolioAccentStyle(preview)}
        className="space-y-2 rounded-lg border border-border bg-background p-3"
      >
        <p className="text-xs font-medium text-muted-foreground">Portfolio colour preview</p>
        <span className="inline-flex min-h-10 items-center rounded-md border border-border bg-primary px-4 text-sm font-medium text-primary-foreground">
          Enquire
        </span>
        <p className="text-xs text-muted-foreground">{preview} · Buttons and highlights</p>
      </section>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || invalid || validDraft === applied}
          onClick={apply}
        >
          Use colour
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || !hasChange}
          aria-label="Cancel colour change"
          onClick={() => setDraft(applied)}
        >
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Choose Use colour, then Save changes to publish it.
      </p>
    </div>
  );
}
