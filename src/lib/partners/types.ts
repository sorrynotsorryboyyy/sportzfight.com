/**
 * Partner programme: gyms and coaches who bring paying players.
 *
 * Partners are created BY HAND from /admin — there is no self-signup. That is
 * deliberate: commissions are real money, and a curated list is the cheapest
 * fraud control there is.
 */

export type PartnerKind = 'gym' | 'coach';

/** Default rates, in basis points. 1200 bps = 12%. */
export const RATE_FIRST_BPS = 1200;
export const RATE_RECURRING_BPS = 700;

/**
 * Minimum balance before a transfer is worth making.
 *
 * Not a threshold on *earning* — a partner earns from their first referral.
 * This only stops 0,42 € bank transfers.
 */
export const PAYOUT_MINIMUM_CENTS = 2000;

/** How long an attribution cookie survives a visit to /p/CODE. */
export const ATTRIBUTION_DAYS = 90;

export interface Partner {
  /** Document id. */
  id: string;
  /** The code a player types or carries in a link. Uppercase, unique. */
  code: string;
  name: string;
  kind: PartnerKind;
  /** The account that sees /partenaire, once they have one. */
  ownerUid: string | null;

  /**
   * Rates in basis points, stored PER PARTNER rather than globally: a single
   * hardcoded rate would leave no room to negotiate with a large gym.
   */
  rateFirstBps: number;
  rateRecurringBps: number;

  // ---- shown on the public page ----
  city: string | null;
  blurb: string | null;
  logoUrl: string | null;

  /** Deactivated partners keep their history but stop earning. */
  active: boolean;
  createdAt: unknown;
}

/** The public subset. Everything else stays admin-only. */
export interface PartnerPublic {
  code: string;
  name: string;
  kind: PartnerKind;
  city: string | null;
  blurb: string | null;
  logoUrl: string | null;
}

/**
 * One settled Stripe invoice.
 *
 * Written only by the webhook, keyed by the Stripe invoice id so a replayed
 * event overwrites rather than double-pays. No client may read this collection:
 * it holds what every player pays.
 */
export interface Payment {
  uid: string;
  invoiceId: string;
  subscriptionId: string | null;
  amountCents: number;
  currency: string;
  plan: string | null;

  /** Null when nobody referred this player. */
  partnerId: string | null;
  /** First invoice of this subscription — decides 12% vs 7%. */
  isFirstPayment: boolean;
  /** Frozen at write time, never recomputed. */
  commissionCents: number;
  /** The rate actually applied, kept for auditing a past payout. */
  commissionBps: number;

  paidAt: unknown;
  /** Set when you have actually transferred the money. */
  commissionPaidAt: unknown | null;
}

/** What a partner is allowed to see about their own performance. */
export interface PartnerStats {
  code: string;
  name: string;
  active: boolean;
  rateFirstBps: number;
  rateRecurringBps: number;
  /** Accounts created with this code. */
  referrals: number;
  /** How many of those are currently paying. */
  subscribers: number;
  /** Commission earned this calendar month, in cents. */
  monthCents: number;
  /** Owed and not yet transferred. */
  pendingCents: number;
  /** Transferred to date. */
  paidCents: number;
  payoutMinimumCents: number;
}
