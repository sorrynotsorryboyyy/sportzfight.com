import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';

/**
 * Web app manifest.
 *
 * The app is mobile-first and used mid-effort, so being able to pin it to a
 * home screen and open it without browser chrome is worth having. It also gives
 * substance to the landing's "Bientôt sur mobile" while the native apps do not
 * exist.
 *
 * Icons point at the app-icon route, which generates them — no binaries.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — défis sportifs en 1 vs 1`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: 'fr',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#07090c',
    theme_color: '#07090c',
    categories: ['sports', 'health', 'games'],
    icons: [
      { src: '/icon', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Without a maskable entry Android draws the icon inside a white circle.
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
