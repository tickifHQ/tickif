import type { ComponentProps } from 'react';

type SvgProps = ComponentProps<'svg'>;

export function TickifBrandIcon({ className, ...props }: SvgProps) {
  return (
    <svg viewBox="0 0 20 20" data-slot="tickif-brand-icon" className={className} {...props}>
      <path
        fill="currentColor"
        d="M1.65163 0.0182928C2.9331 -0.00423177 4.27275 0.015395 5.55787 0.015453L13.5159 0.0153362L17.4266 0.00852416C17.643 0.00846618 19.4884 -0.0451928 19.5706 0.117465C19.7055 0.384571 19.5735 1.33417 19.5041 1.65577C19.2117 3.01183 18.6903 3.89367 17.5169 4.64536C16.3046 5.28005 14.7092 5.1169 13.3638 5.11652L8.44233 5.11675L3.09011 5.1178C2.27351 5.1182 0.994766 5.15734 0.220289 5.09878C0.128741 5.00862 0.0722702 4.9205 0 4.81611C0.04847 4.24925 0.31462 3.44002 0.452348 2.86717L0.88652 1.10605C0.954876 0.829582 1.03805 0.395876 1.13249 0.140801C1.25674 0.0142057 1.47425 0.0275693 1.65163 0.0182928Z"
      />
      <path
        fill="currentColor"
        d="M6.80245 6.41545C6.864 6.41351 7.03071 6.40316 7.07483 6.44035C8.49986 7.64134 10.0936 8.61914 11.5036 9.8364C11.6319 9.94713 11.7224 10.0466 11.8768 10.1254C11.8624 11.7195 11.8904 13.3032 11.9175 14.897C11.9443 16.4685 11.7229 17.6179 10.5681 18.7575C10.0371 19.2547 9.35875 19.6559 8.63608 19.8165C8.24261 19.9037 7.11696 20.1412 6.77398 19.8832C6.66698 19.8026 6.69395 18.4636 6.69395 18.2258L6.69458 15.438L6.6938 9.79407C6.69348 8.82497 6.68945 7.84948 6.69838 6.88017C6.7 6.70598 6.70803 6.56419 6.80245 6.41545Z"
      />
      <path
        fill="currentColor"
        d="M15.9564 9.51417C16.8018 9.36314 17.6631 9.67883 18.2107 10.3407C18.7584 11.0022 18.9077 11.9072 18.6015 12.7096C18.2954 13.5121 17.5811 14.0875 16.732 14.2162C15.4428 14.4116 14.2359 13.5344 14.0237 12.2478C13.8115 10.9613 14.6727 9.74319 15.9564 9.51417Z"
      />
    </svg>
  );
}

export function GoogleBrandIcon({ className, ...props }: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
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
      <path
        fill="#fff"
        d="M11 10h2.2v1c.5-.8 1.5-1.3 2.8-1.3 2.2 0 3.5 1.5 3.5 4.1V17h-2.4v-3c0-1.4-.5-2.2-1.7-2.2-1.1 0-1.8.8-1.8 2.2V17H11z"
      />
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
