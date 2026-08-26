import { NextResponse } from 'next/server';
import { adminDb, bearer, uidFromToken } from '@/lib/server/firebase-admin';
import { paymentsEnabled, priceForPlan } from '@/lib/server/env';
import { stripe } from '@/lib/server/stripe';
import { SITE_URL } from '@/lib/site';

/**
 * Open a Stripe Checkout session for the signed-in account.
 *
 * The security point: the uid comes from a VERIFIED Firebase ID token, never
 * from the request body. Otherwise anyone could open a checkout that credits
 * somebody else's account — or, worse, discover which accounts exist.
 */

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!paymentsEnabled) {
    return NextResponse.json(
      { error: 'payments_disabled' },
      { status: 503 },
    );
  }

  const uid = await uidFromToken(bearer(req));
  if (!uid) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let plan: unknown;
  try {
    ({ plan } = (await req.json()) as { plan?: unknown });
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const price = typeof plan === 'string' ? priceForPlan(plan) : null;
  if (!price) {
    return NextResponse.json({ error: 'unknown_plan' }, { status: 400 });
  }

  const client = stripe();
  const db = adminDb();
  if (!client || !db) {
    return NextResponse.json({ error: 'payments_disabled' }, { status: 503 });
  }

  try {
    // Reuse the Stripe customer if this account already has one, so a second
    // subscription does not create a duplicate customer and orphan the first.
    const snap = await db.doc(`users/${uid}`).get();
    const existing = snap.get('subscription.stripeCustomerId') as
      | string
      | undefined;

    // The email is only used to label the customer in the Stripe dashboard —
    // this is the purpose that private/contact was previously stored without.
    const contact = await db.doc(`users/${uid}/private/contact`).get();
    const email = (contact.get('email') as string | undefined) || undefined;

    const session = await client.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      ...(existing ? { customer: existing } : { customer_email: email }),
      // The uid travels on the subscription itself, so the webhook can find the
      // account from any event without a lookup table.
      subscription_data: { metadata: { uid } },
      metadata: { uid },
      client_reference_id: uid,
      locale: 'fr',
      allow_promotion_codes: true,
      success_url: `${SITE_URL}/compte?abonnement=ok`,
      cancel_url: `${SITE_URL}/boutique`,
    });

    if (!session.url) {
      return NextResponse.json({ error: 'no_session_url' }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch {
    // Never surface a Stripe error verbatim: it can name price ids and account
    // details that have no business reaching a browser.
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 });
  }
}
