import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@collabiz/ui'],
  output: 'standalone',
  poweredByHeader: false,
  // /api/v1/* is proxied by app/api/v1/[...path]/route.ts, resolved at runtime from API_INTERNAL_URL.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        // Next.js injects inline bootstrap scripts, hence 'unsafe-inline' for scripts until nonce-based CSP is adopted.
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
      ],
    }];
  },
};
export default config;
