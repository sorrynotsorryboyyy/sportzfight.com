import type { NextConfig } from 'next';

/**
 * Security headers.
 *
 * The file was empty. For a site that takes card payments and asks for camera
 * access, the defaults are not enough — and these cost nothing at runtime.
 */
const securityHeaders = [
  // Clickjacking: nobody should be able to frame the battle screen and
  // capture taps over it.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // HSTS, two years, subdomains included. Vercel serves HTTPS already; this
  // stops the first request of a session going out in the clear.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  /**
   * Camera is granted to this origin only, and everything else is off.
   *
   * `camera=(self)` is load-bearing: the detector needs it. The rest are
   * denied because the app has no business asking, and an explicit denial is
   * what stops an injected script from asking on our behalf.
   */
  {
    key: 'Permissions-Policy',
    value: [
      'camera=(self)',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'interest-cohort=()',
    ].join(', '),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
