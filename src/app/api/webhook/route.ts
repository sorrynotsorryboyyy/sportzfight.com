import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { adminDb } from '@/lib/server/firebase-admin';
import { STRIPE_WEBHOOK_SECRET, paymentsEnabled, planForPrice } from '@/lib/server/env';
import { stripe } from '@/lib/server/stripe';
import { commissionFor } from '@/lib/partners/commission';
import type { Partner } from '@/lib/partners/types';
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

/**
 * A failure Stripe should retry, as opposed to an event we legitimately ignore.
 *
 * The distinction decides whether a customer who paid ever gets what they paid
 * for: answer 200 and Stripe marks the event delivered forever.
 */
class Retryable extends Error {}

/** Mirror one Stripe subscription onto the user document. */
async function persist(sub: Stripe.Subscription): Promise<void> {
  const db = adminDb();
  // NOT a no-op: the credentials are broken, not the event. Returning here
  // used to answer 200, so a misconfigured FIREBASE_SERVICE_ACCOUNT charged
  // every customer and granted nothing, silently and permanently.
  if (!db) throw new Retryable('no_admin_db');

  const uid = sub.metadata?.uid;
  if (!uid) return; // Genuinely not ours: created outside the app.

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

/**
 * Record one settled invoice, and freeze the commission it earns.
 *
 * Until this existed the system stored subscription STATE and nothing else —
 * no amount, no date, no history — so there was no number to take a percentage
 * of. This is that number.
 *
 * Keyed by the Stripe invoice id, which makes a replayed event a no-op rather
 * than a double payout. Stripe retries aggressively; that guarantee matters.
 */
async function recordPayment(
  invoice: Stripe.Invoice,
  client: Stripe,
): Promise<void> {
  const db = adminDb();
  if (!db) throw new Retryable('no_admin_db');
  // No id means nothing to key the ledger on; Stripe always sends one.
  if (!invoice.id) return;

  // Nothing changed hands: a 100%-discounted or zero invoice still fires.
  const amountCents = invoice.amount_paid ?? 0;

  const subscriptionId =
    typeof invoice.parent?.subscription_details?.subscription === 'string'
      ? invoice.parent.subscription_details.subscription
      : (invoice.parent?.subscription_details?.subscription?.id ?? null);

  // The uid rides on the subscription metadata set at checkout. Without it the
  // invoice belongs to no account we know, and guessing would be worse.
  let uid: string | null = null;
  let partnerId: string | null = null;
  let plan: string | null = null;

  if (subscriptionId) {
    try {
      const sub = await client.subscriptions.retrieve(subscriptionId);
      uid = sub.metadata?.uid ?? null;
      partnerId = sub.metadata?.partnerId || null;
      const priceId = sub.items.data[0]?.price?.id;
      plan = priceId ? planForPrice(priceId) : null;
    } catch {
      // Swallowing this dropped the payment record — and with it the partner
      // commission — with no trace. Let Stripe retry.
      throw new Retryable('subscription_lookup_failed');
    }
  }
  if (!uid) return;

  const ref = db.doc(`payments/${invoice.id}`);
  if ((await ref.get()).exists) return; // Already recorded.

  // First invoice of this subscription decides 12% versus 7%. Counted from our
  // own ledger rather than from Stripe's billing_reason, which varies by flow.
  let isFirstPayment = true;
  if (subscriptionId) {
    const prior = await db
      .collection('payments')
      .where('subscriptionId', '==', subscriptionId)
      .limit(1)
      .get();
    isFirstPayment = prior.empty;
  }

  // Read the partner fresh: rates are negotiable and deactivation must bite
  // immediately, so a stale copy in metadata would be wrong.
  let partner: Partner | null = null;
  if (partnerId) {
    const snap = await db.doc(`partners/${partnerId}`).get();
    if (snap.exists) partner = { id: snap.id, ...snap.data() } as Partner;
  }

  const { commissionCents, commissionBps } = commissionFor({
    amountCents,
    partner,
    isFirstPayment,
  });

  await ref.set({
    uid,
    invoiceId: invoice.id,
    subscriptionId,
    amountCents,
    currency: invoice.currency ?? 'eur',
    plan,
    partnerId: partner ? partnerId : null,
    isFirstPayment,
    commissionCents,
    commissionBps,
    paidAt: new Date(),
    commissionPaidAt: null,
  });
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

      case 'invoice.paid':
        // THE money event: the only one carrying an amount. Subscription
        // events describe state; this one describes a payment.
        await recordPayment(event.data.object, client);
        break;

      default:
        // Unhandled event types are acknowledged, not errored: replying non-2xx
        // makes Stripe retry something we will never handle.
        break;
    }
  } catch (e) {
    // Anything that reaches here is a failure to record something Stripe has
    // already accepted money for. 500 makes Stripe retry for three days; 200
    // would abandon it after the first attempt.
    const reason = e instanceof Retryable ? e.message : 'persist_failed';
    return NextResponse.json({ error: reason }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
