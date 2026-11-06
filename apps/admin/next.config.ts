import type { NextConfig } from 'next';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  transpilePackages: ['@collabiz/ui'],
  output: 'standalone',
  poweredByHeader: false,
  // Same-origin API proxy: auth cookies stay first-party (httpOnly + SameSite=Lax + CSRF double-submit).
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API}/v1/:path*` }];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
      ],
    }];
  },
};
export default config;
