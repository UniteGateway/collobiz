import type { Metadata, Viewport } from 'next';
import '@collabiz/ui/styles.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = { title: { default: 'COLLABIZ Admin — Unite Group', template: '%s · COLLABIZ Admin' }, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#011E48' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
