import 'server-only';

/**
 * Server-side configuration, read once and validated in one place.
 *
 * Payment is OPTIONAL by design: with no Stripe keys the shop stays in its
 * "Bientôt" state and every API route refuses politely. That is what lets the
 * legal/launch work ship before the Stripe account exists, and what keeps a
 * misconfigured preview deployment from half-working.
 */

function opt(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

export const STRIPE_SECRET_KEY = opt('STRIPE_SECRET_KEY');
export const STRIPE_WEBHOOK_SECRET = opt('STRIPE_WEBHOOK_SECRET');
export const STRIPE_PRICE_PREMIUM = opt('STRIPE_PRICE_PREMIUM');
export const STRIPE_PRICE_SOUTIEN = opt('STRIPE_PRICE_SOUTIEN');
export const FIREBASE_SERVICE_ACCOUNT = opt('FIREBASE_SERVICE_ACCOUNT');

/**
 * Can we actually take a payment?
 *
 * All five, not some: a checkout that succeeds while the webhook secret is
 * missing would charge a card and never grant the subscription. Half-configured
 * is worse than off.
 */
export const paymentsEnabled =
  STRIPE_SECRET_KEY !== null &&
  STRIPE_WEBHOOK_SECRET !== null &&
  STRIPE_PRICE_PREMIUM !== null &&
  STRIPE_PRICE_SOUTIEN !== null &&
  FIREBASE_SERVICE_ACCOUNT !== null;

/** Which plan a Stripe price id corresponds to. */
export function planForPrice(priceId: string): 'premium' | 'soutien' | null {
  if (STRIPE_PRICE_PREMIUM && priceId === STRIPE_PRICE_PREMIUM) return 'premium';
  if (STRIPE_PRICE_SOUTIEN && priceId === STRIPE_PRICE_SOUTIEN) return 'soutien';
  return null;
}

/** The Stripe price id for a plan the client asked for. */
export function priceForPlan(plan: string): string | null {
  if (plan === 'premium') return STRIPE_PRICE_PREMIUM;
  if (plan === 'soutien') return STRIPE_PRICE_SOUTIEN;
  return null;
}
