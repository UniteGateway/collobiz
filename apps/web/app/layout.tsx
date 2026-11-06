import type { Metadata, Viewport } from 'next';
import '@collabiz/ui/styles.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: { default: 'COLLABIZ — Connect. Collaborate. Grow.', template: '%s · COLLABIZ' },
  description: 'Unite-first hybrid B2B collaboration network for consultants, EPC contractors, traders, manufacturers and project developers. Powered by Unite Group.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#011E48' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
