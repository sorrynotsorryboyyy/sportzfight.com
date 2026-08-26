import { NextResponse } from 'next/server';
import { adminDb, bearer, uidFromToken } from '@/lib/server/firebase-admin';
import { paymentsEnabled } from '@/lib/server/env';
import { stripe } from '@/lib/server/stripe';
import { SITE_URL } from '@/lib/site';

/**
 * The Stripe billing portal: change card, see invoices, cancel.
 *
 * French law requires cancelling to be as easy as subscribing, and the portal
 * is Stripe's hosted answer to that — no cancellation flow to build or get
 * wrong.
 *
 * Same rule as checkout: the customer id comes from the VERIFIED uid's own
 * document, never from the request. Otherwise anyone could open a portal onto
 * someone else's billing.
 */

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!paymentsEnabled) {
    return NextResponse.json({ error: 'payments_disabled' }, { status: 503 });
  }

  const uid = await uidFromToken(bearer(req));
  if (!uid) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const client = stripe();
  const db = adminDb();
  if (!client || !db) {
    return NextResponse.json({ error: 'payments_disabled' }, { status: 503 });
  }

  try {
    const snap = await db.doc(`users/${uid}`).get();
    const customer = snap.get('subscription.stripeCustomerId') as
      | string
      | undefined;

    if (!customer) {
      return NextResponse.json({ error: 'no_subscription' }, { status: 404 });
    }

    const session = await client.billingPortal.sessions.create({
      customer,
      return_url: `${SITE_URL}/compte`,
      locale: 'fr',
    });

    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json({ error: 'portal_failed' }, { status: 502 });
  }
}
