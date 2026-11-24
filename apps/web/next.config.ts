import type { NextConfig } from 'next';

// U meet video provider host (Jitsi). Set MEETING_JITSI_BASE_URL to a self-hosted Jitsi in production.
const jitsi = (() => { try { return new URL(process.env.MEETING_JITSI_BASE_URL ?? 'https://meet.jit.si').origin; } catch { return 'https://meet.jit.si'; } })();

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
        { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.ytimg.com; font-src 'self' data:; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://player.vimeo.com ${jitsi}; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: `camera=(self "${jitsi}"), microphone=(self "${jitsi}"), display-capture=(self "${jitsi}"), geolocation=(self)` },
      ],
    }];
  },
};
export default config;
