import type { NextConfig } from 'next';

// React's development build needs eval for debugging aids; production keeps the stricter policy.
const scriptSrc = process.env.NODE_ENV === 'production' ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Solver (WebAssembly), Prisma and the PDF/Excel writers run only on the server and are not bundled.
  serverExternalPackages: ['highs', '@prisma/client', 'pdfkit', 'exceljs', '@unite/power-engine'],
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Content-Security-Policy', value: `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};
export default config;
