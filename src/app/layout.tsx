import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

import { THEME_INIT_SCRIPT } from '@/lib/theme/constants';

import './globals.css';

// Self-hosted variable fonts: no external request, no layout shift.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Monospace carries instrument labels and diagnostic codes.
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'AutoMind',
    template: '%s · AutoMind',
  },
  description: 'Vehicle diagnostic intelligence.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning covers only this element's own attributes: the
    // theme script below sets data-theme before hydration, so the server
    // markup legitimately differs from the DOM React finds. Children are
    // unaffected, so real mismatches deeper in the tree still surface.
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint, so there is no flash
            of the wrong theme. Must run synchronously, ahead of hydration. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
