'use client';
import React from 'react';
import Link from 'next/link';
import { LinkProvider } from '@collabiz/ui';
import { SessionProvider } from '@/lib/session';

const NextLink = ({ href, children, ...rest }: { href: string; children?: React.ReactNode; className?: string; 'aria-current'?: 'page' | undefined; onClick?: () => void }) => (
  <Link href={href} {...rest}>{children}</Link>
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LinkProvider link={NextLink}>
      <SessionProvider>{children}</SessionProvider>
    </LinkProvider>
  );
}
