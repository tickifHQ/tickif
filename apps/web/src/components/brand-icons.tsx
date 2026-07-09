import type { ComponentProps } from 'react';

type SvgProps = ComponentProps<'svg'>;

export function GoogleBrandIcon({ className, ...props }: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...props}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export function InstagramBrandIcon({ className, ...props }: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...props}>
      <defs>
        <linearGradient id="instagram-brand-gradient" x1="0%" x2="100%" y1="100%" y2="0%">
          <stop offset="0%" stopColor="#F58529" />
          <stop offset="35%" stopColor="#FEDA77" />
          <stop offset="60%" stopColor="#DD2A7B" />
          <stop offset="82%" stopColor="#8134AF" />
          <stop offset="100%" stopColor="#515BD4" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="url(#instagram-brand-gradient)" />
      <circle cx="12" cy="12" r="4.25" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="#fff" />
    </svg>
  );
}

export function LinkedInBrandIcon({ className, ...props }: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="4" fill="#0A66C2" />
      <rect x="7" y="10" width="2.3" height="7" fill="#fff" />
      <rect x="7" y="7" width="2.3" height="2.3" fill="#fff" />
      <path fill="#fff" d="M11 10h2.2v1c.5-.8 1.5-1.3 2.8-1.3 2.2 0 3.5 1.5 3.5 4.1V17h-2.4v-3c0-1.4-.5-2.2-1.7-2.2-1.1 0-1.8.8-1.8 2.2V17H11z" />
    </svg>
  );
}

export function YouTubeBrandIcon({ className, ...props }: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...props}>
      <rect x="3" y="6" width="18" height="12" rx="4" fill="#FF0033" />
      <path fill="#fff" d="M10 9.5v5l4.8-2.5z" />
    </svg>
  );
}
