import { ThemeProvider } from '@repo/ui/components/theme-provider';
import type { Metadata } from 'next';
import { Fraunces, Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// Themes consume these via --font-*-base, so swapping the brand fonts
// stays a one-line change here.
const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans-base',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display-base',
  axes: ['opsz'],
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-base',
});

export const metadata: Metadata = {
  title: 'Tickif',
  description: 'Discover real interior design projects across India.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${hanken.variable} ${fraunces.variable} ${plexMono.variable} min-h-screen bg-background font-sans text-foreground antialiased`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
