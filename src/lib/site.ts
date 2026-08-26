/**
 * Canonical site identity, in one place.
 *
 * Metadata, robots, sitemap and the share image all need the absolute origin,
 * and getting it wrong breaks link previews silently — the image URL resolves
 * against the wrong host and simply does not load.
 *
 * Vercel injects VERCEL_PROJECT_PRODUCTION_URL on every deployment, so
 * preview builds describe themselves correctly without hardcoding a domain.
 */
function resolveOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return 'http://localhost:3000';
}

export const SITE_URL = resolveOrigin();

export const SITE_NAME = 'SportzFight';

export const SITE_TAGLINE = 'Le sport sans excuse';

export const SITE_DESCRIPTION =
  'Affronte quelqu’un en direct, 60 secondes chrono. Ta caméra compte les répétitions — et la vidéo ne quitte jamais ton téléphone.';
