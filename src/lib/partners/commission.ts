import {
  RATE_FIRST_BPS,
  RATE_RECURRING_BPS,
  type Partner,
} from './types';

/**
 * What a partner earns on one invoice.
 *
 * Kept in its own module, free of Firebase and Stripe, because it decides how
 * much real money leaves your account — it has to be readable and testable on
 * its own.
 *
 * Rates are basis points and amounts are integer cents throughout. Percentages
 * as floats would drift: 12% of 599 is 71.88, and rounding that inconsistently
 * across a year of invoices produces a balance nobody can reconcile.
 */

export interface CommissionInput {
  amountCents: number;
  /** Null when the player came on their own. */
  partner: Pick<Partner, 'rateFirstBps' | 'rateRecurringBps' | 'active'> | null;
  /** First invoice of this subscription. */
  isFirstPayment: boolean;
}

export interface CommissionResult {
  commissionCents: number;
  /** The rate applied, stored alongside so a past payout can be audited. */
  commissionBps: number;
}

const NONE: CommissionResult = { commissionCents: 0, commissionBps: 0 };

/**
 * Round half up, on the absolute value.
 *
 * `Math.round(-0.5)` is `-0` in JavaScript, which would make negative amounts
 * round the opposite way from positive ones. Refunds are guarded below, but a
 * rounding helper should not depend on its caller for correctness.
 */
function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function commissionFor({
  amountCents,
  partner,
  isFirstPayment,
}: CommissionInput): CommissionResult {
  if (!partner || !partner.active) return NONE;

  // A refund or a zero invoice must never produce a negative commission: that
  // would mean clawing money back out of a partner's balance, silently.
  if (!Number.isFinite(amountCents) || amountCents <= 0) return NONE;

  const bps = isFirstPayment
    ? partner.rateFirstBps
    : partner.rateRecurringBps;

  if (!Number.isFinite(bps) || bps <= 0) return NONE;

  return {
    commissionCents: roundHalfUp((amountCents * bps) / 10_000),
    commissionBps: bps,
  };
}

/** Human-readable rate, for the dashboard and the public page. */
export const bpsToPercent = (bps: number): number => bps / 100;

/** The rates a new partner starts on. */
export const defaultRates = () => ({
  rateFirstBps: RATE_FIRST_BPS,
  rateRecurringBps: RATE_RECURRING_BPS,
});

/**
 * Normalise a code typed by a human or pulled from a URL.
 *
 * Uppercase and stripped of anything that is not a letter or digit: partners
 * will write their code on a poster, and someone will type "fit-pro " with a
 * trailing space.
 */
export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
}

/** Is this a code we are willing to store? */
export function isValidCode(raw: string): boolean {
  const code = normaliseCode(raw);
  return code.length >= 3 && code.length <= 20;
}
