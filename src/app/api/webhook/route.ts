import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { adminDb } from '@/lib/server/firebase-admin';
import { STRIPE_WEBHOOK_SECRET, paymentsEnabled, planForPrice } from '@/lib/server/env';
import { stripe } from '@/lib/server/stripe';
import type { SubscriptionStatus } from '@/lib/subscription';

/**
 * Stripe's callback — the only writer of `subscription`.
 *
 * Everything rests on the signature check below. Without it this URL is a
 * public endpoint that grants subscriptions to whoever posts the right JSON,
 * so it is verified BEFORE the payload is parsed or trusted in any way.
 *
 * The uid is read from the subscription metadata set at checkout, never from
 * anything a caller could choose.
 */

export const runtime = 'nodejs';

/** Statuses we mirror. Anything else is treated as not granting. */
function statusOf(s: Stripe.Subscription.Status): SubscriptionStatus {
  switch (s) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'paused':
      return 'canceled';
    default:
      return 'incomplete';
  }
}

/** Mirror one Stripe subscription onto the user document. */
async function persist(sub: Stripe.Subscription): Promise<void> {
  const db = adminDb();
  if (!db) return;

  const uid = sub.metadata?.uid;
  if (!uid) return; // Not ours, or created outside the app.

  const item = sub.items.data[0];
  const priceId = item?.price?.id;
  const plan = priceId ? planForPrice(priceId) : null;
  if (!plan) return; // A price we do not sell.

  // The period end lives on the item in recent API versions; fall back for
  // older shapes so a version bump cannot silently zero it out.
  const periodEnd =
    (item as unknown as { current_period_end?: number })?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    null;

  const status = statusOf(sub.status);

  await db.doc(`users/${uid}`).set(
    {
      subscription: {
        plan,
        status,
        currentPeriodEnd: periodEnd ? { seconds: periodEnd } : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        stripeCustomerId:
          typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
        stripeSubscriptionId: sub.id,
        updatedAt: new Date(),
      },
    },
    // Merge: this document holds the player's whole profile and progression.
    { merge: true },
  );
}

export async function POST(req: Request) {
  if (!paymentsEnabled) {
    return NextResponse.json({ error: 'payments_disabled' }, { status: 503 });
  }

  const client = stripe();
  const signature = req.headers.get('stripe-signature');
  if (!client || !signature || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unsigned' }, { status: 400 });
  }

  // The RAW body: Stripe signs the bytes, so parsing first would break the
  // check and any re-serialisation would change them.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = await client.webhooks.constructEventAsync(
      raw,
      signature,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    // Forged, replayed, or signed with the wrong secret. Nothing is written.
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await persist(event.data.object);
        break;

      case 'checkout.session.completed': {
        // Fetch rather than trust the session: this gives the authoritative
        // status and period, and the metadata we set at checkout.
        const session = event.data.object;
        const id =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        if (id) await persist(await client.subscriptions.retrieve(id));
        break;
      }

      default:
        // Unhandled event types are acknowledged, not errored: replying non-2xx
        // makes Stripe retry something we will never handle.
        break;
    }
  } catch {
    // A write failure SHOULD be retried, so this one does return an error.
    return NextResponse.json({ error: 'persist_failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
