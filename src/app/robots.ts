import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // /admin is a tuning bench, /api is machine-only, and a battle URL is
      // ephemeral and personal — none of it belongs in an index.
      disallow: ['/admin', '/api/', '/battle/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
