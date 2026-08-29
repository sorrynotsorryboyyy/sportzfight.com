import { NextResponse } from 'next/server';
import {
  FIREBASE_SERVICE_ACCOUNT,
  STRIPE_PRICE_PREMIUM,
  STRIPE_PRICE_SOUTIEN,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  paymentsEnabled,
} from '@/lib/server/env';

/**
 * What the client is allowed to know about the server's configuration.
 *
 * Exactly one boolean. The shop needs to know whether to render a real
 * subscribe button or the "Bientôt" state, and that answer depends on secrets
 * the browser must never see.
 */

export const runtime = 'nodejs';

export async function GET() {
  /*
   * A per-variable breakdown, because "payments: false" alone sent us hunting
   * through five candidates on a deployment we could not read the logs of.
   *
   * Booleans only — never a value, never a prefix, never a length. Whether a
   * variable is SET is operational information the operator needs; what it
   * contains is a secret, and a debug endpoint that leaks half a key is worse
   * than no debug endpoint.
   */
  const configured = {
    stripeKey: !!STRIPE_SECRET_KEY,
    webhookSecret: !!STRIPE_WEBHOOK_SECRET,
    pricePremium: !!STRIPE_PRICE_PREMIUM,
    priceSoutien: !!STRIPE_PRICE_SOUTIEN,
    serviceAccount: !!FIREBASE_SERVICE_ACCOUNT,
    /*
     * Parsed, not merely present — a service account mangled by a copy-paste
     * fails identically to an absent one from outside.
     *
     * Checked HERE rather than by calling adminDb(), deliberately. Importing
     * firebase-admin into this route took the one working diagnostic endpoint
     * down with it, which is exactly the wrong failure for the page whose job
     * is to explain failures. This route must depend on nothing that can throw.
     */
    serviceAccountUsable: (() => {
      if (!FIREBASE_SERVICE_ACCOUNT) return false;
      try {
        const j = JSON.parse(FIREBASE_SERVICE_ACCOUNT) as Record<string, unknown>;
        return (
          typeof j.project_id === 'string' &&
          typeof j.client_email === 'string' &&
          typeof j.private_key === 'string' &&
          j.private_key.includes('BEGIN PRIVATE KEY')
        );
      } catch {
        return false;
      }
    })(),
    siteUrl: !!process.env.NEXT_PUBLIC_SITE_URL,
  };

  return NextResponse.json(
    { payments: paymentsEnabled, configured },
    // Short cache: flipping the env vars should take effect quickly, but this
    // must not be re-asked on every render.
    { headers: { 'cache-control': 'public, max-age=60' } },
  );
}
