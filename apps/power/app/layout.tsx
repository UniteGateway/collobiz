import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = { title: 'Unite Power Dispatch', description: 'Solar + BESS smart energy optimiser — Unite Developers Global Inc.' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en-IN" suppressHydrationWarning><body>{children}</body></html>;
}
