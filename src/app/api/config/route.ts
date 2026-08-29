import { NextResponse } from 'next/server';
import {
  FIREBASE_SERVICE_ACCOUNT,
  STRIPE_PRICE_PREMIUM,
  STRIPE_PRICE_SOUTIEN,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  paymentsEnabled,
} from '@/lib/server/env';
import { adminDb } from '@/lib/server/firebase-admin';

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
    // Parsed, not merely present: a service account mangled by a copy-paste is
    // the failure that looks identical to an absent one from outside.
    serviceAccountUsable: adminDb() !== null,
    siteUrl: !!process.env.NEXT_PUBLIC_SITE_URL,
  };

  return NextResponse.json(
    { payments: paymentsEnabled, configured },
    // Short cache: flipping the env vars should take effect quickly, but this
    // must not be re-asked on every render.
    { headers: { 'cache-control': 'public, max-age=60' } },
  );
}
