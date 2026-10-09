/** Shared control styling; composite fields inherit the same states. */
export const controlStyles =
  'w-full min-w-0 rounded-lg border border-input bg-background text-foreground shadow-xs transition-[color,background-color,border-color,box-shadow] placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground hover:border-foreground-secondary focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/25 motion-reduce:transition-none';

export const controlTextStyles = 'text-base md:text-sm';
