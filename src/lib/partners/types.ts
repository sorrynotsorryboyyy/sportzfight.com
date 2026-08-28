/**
 * Partner programme: gyms and coaches who bring paying players.
 *
 * Partners are created BY HAND from /admin — there is no self-signup. That is
 * deliberate: commissions are real money, and a curated list is the cheapest
 * fraud control there is.
 */

export type PartnerKind = 'gym' | 'coach';

/**
 * The commission rate, in basis points. 2500 bps = 25%.
 *
 * One rate, on every invoice, for as long as the person stays subscribed. This
 * replaced a 12%/7% time tier: the tier turned the pitch into a two-column
 * table nobody read, and a gym owner who cannot state their rate in one number
 * does not repeat it to the next gym owner.
 *
 * Both fields keep the same value on purpose — see the note on Partner about
 * why the two are not collapsed into one.
 */
export const RATE_FIRST_BPS = 2500;
export const RATE_RECURRING_BPS = 2500;

/**
 * The rates the programme used before the flat 25%.
 *
 * Kept only so the rate migration can tell "never negotiated, merely old" from
 * a rate somebody actually agreed to. Delete once every partner has moved.
 */
export const LEGACY_RATE_FIRST_BPS = 1200;
export const LEGACY_RATE_RECURRING_BPS = 700;

/**
 * Minimum balance before a transfer is worth making.
 *
 * Not a threshold on *earning* — a partner earns from their first referral, and
 * anything below this is carried to next month rather than lost. This only
 * stops 0,42 € bank transfers.
 *
 * Lowered from 20 € when the rate went to 25%. At 7% recurring, 20 € was
 * thirteen months of a Premium subscription: a coach with five referrals waited
 * a full quarter for a first transfer, which is exactly when someone concludes
 * the programme pays nothing and stops promoting it.
 */
export const PAYOUT_MINIMUM_CENTS = 1000;

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
   *
   * The two fields survive the flat 25% default deliberately. "25% flat" is the
   * poster; "40% on the first month for the first ten gyms this quarter" is the
   * closing argument, and collapsing these into one field would make that a
   * schema change instead of an admin edit.
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
  /**
   * First invoice of this subscription.
   *
   * No longer a rate selector — the rate is flat. Kept because it is the only
   * thing separating an acquisition from a renewal in the ledger, and "how many
   * NEW subscribers did this gym bring last month" is the one number that says
   * whether a partnership is working.
   */
  isFirstPayment: boolean;
  /** Frozen at write time, never recomputed. */
  commissionCents: number;
  /** The rate actually applied, kept for auditing a past payout. */
  commissionBps: number;

  paidAt: unknown;
  /** Set when you have actually transferred the money. */
  commissionPaidAt: unknown | null;
  /**
   * The admin who recorded the transfer.
   *
   * Was already being written by /api/admin/payouts and simply missing from
   * this type — the shape had drifted from its only writer.
   */
  paidBy?: string | null;
  /**
   * The statement that settled this line, `{partnerId}_{period}`.
   *
   * Without it, "which transfer paid this invoice?" is answerable only by
   * comparing timestamps and hoping.
   */
  statementId?: string | null;
}

/**
 * Something a partner gives you in person for being on SportzFight:
 * "1 séance d'essai offerte", "-20 % le premier mois", "gourde offerte".
 *
 * NOT called a "perk". That word already means a SUBSCRIPTION benefit in this
 * codebase (see lib/subscription.ts and tests/perks.test.ts), and two meanings
 * for one word is how the wrong thing gets rendered on the wrong page.
 *
 * Redeemed at the gym, never in the app. No stock, no shipping, no
 * fulfilment: this is a promise the partner makes on their own premises, and
 * the app's only job is to display it accurately — and to say clearly whose
 * promise it is.
 *
 * Lives in a SUBCOLLECTION rather than an array on the partner document,
 * because the partner has to be able to write these and the partner document
 * holds their commission rate. An array would mean granting write access to
 * the document that decides how much money they are paid, and rules cannot
 * iterate an array, so "every element is still pending" would be
 * unenforceable.
 */
export type OfferStatus = 'pending' | 'approved' | 'rejected';

export interface PartnerOffer {
  id: string;
  /** "1 séance d'essai offerte". Shown in bold on /p/CODE. */
  label: string;
  /** The conditions. "Sur présentation de ton compte, hors samedi." */
  details: string | null;
  status: OfferStatus;
  /** The uid that wrote it — the partner's owner, or an admin. */
  authorUid: string;
  createdAt: unknown;
  updatedAt: unknown;
  /** Why an admin refused. Shown to the partner, never publicly. */
  reviewNote: string | null;
}

/**
 * Caps. MIRRORED IN firestore.rules — keep the two in sync.
 *
 * The two length caps are per-document and therefore enforceable in rules.
 * OFFERS_MAX is not: counting sibling documents is impossible there, so it is
 * enforced in the API route and by the public page's own query limit. That is
 * acceptable because the consequence of bypassing it is bounded and NOT
 * financial — a scripted client gets a pile of pending offers no admin will
 * approve, so nothing reaches /p/CODE. A rate cap would be money, and that one
 * IS enforced, by the parent document's rule.
 */
export const OFFER_LABEL_MAX = 80;
export const OFFER_DETAILS_MAX = 200;
/** Six is already most of a phone screen, below the primary call to action. */
export const OFFERS_MAX = 6;

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
