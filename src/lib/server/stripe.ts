import 'server-only';
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from './env';

/**
 * The Stripe client.
 *
 * Null when unconfigured, so the routes can answer honestly instead of throwing
 * at module load and taking every page down with them.
 */

let cached: Stripe | null = null;

export function stripe(): Stripe | null {
  if (cached) return cached;
  if (!STRIPE_SECRET_KEY) return null;

  cached = new Stripe(STRIPE_SECRET_KEY, {
    // Pinned deliberately: an unpinned version means Stripe can change response
    // shapes under a deployment nobody is watching.
    apiVersion: '2026-07-29.dahlia',
    typescript: true,
    appInfo: { name: 'SportzFight' },
  });
  return cached;
}
