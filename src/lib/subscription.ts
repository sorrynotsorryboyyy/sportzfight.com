import type { Timestamp } from 'firebase/firestore';

/**
 * Subscription state.
 *
 * Written ONLY by the Stripe webhook through the Admin SDK. Security rules deny
 * this field on every client path, the same way they deny `role` — so what the
 * client reads here is something it could not have written.
 */

export type Plan = 'premium' | 'soutien';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  /** Payment failed; Stripe is retrying. Access continues during the grace. */
  | 'past_due'
  | 'canceled'
  | 'incomplete';

export interface Subscription {
  plan: Plan;
  status: SubscriptionStatus;
  /** End of the paid period. Access holds until then, even after cancelling. */
  currentPeriodEnd: Timestamp | { seconds: number } | null;
  /** Set when the player cancelled but the period has not run out. */
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

/** Statuses that grant access while the period is still running. */
const GRANTING: readonly SubscriptionStatus[] = ['active', 'trialing', 'past_due'];

function endMs(sub: Subscription): number | null {
  const end = sub.currentPeriodEnd;
  if (!end) return null;
  if (typeof end === 'object' && 'seconds' in end) return end.seconds * 1000;
  return null;
}

/**
 * Is this subscription currently granting its perks?
 *
 * Two independent conditions, both required: a granting status AND a period
 * that has not elapsed. Checking only the status would keep perks alive forever
 * if a `customer.subscription.deleted` webhook were ever missed — and a webhook
 * that never arrives is a normal failure, not an exotic one.
 */
export function isActive(sub: Subscription | null | undefined, now = Date.now()): boolean {
  if (!sub) return false;
  if (!GRANTING.includes(sub.status)) return false;

  const end = endMs(sub);
  // No period end means we cannot prove it is still valid. Deny: the failure
  // mode of granting a perk wrongly is worse than asking someone to re-subscribe.
  if (end === null) return false;

  return end > now;
}

/** The active plan, or null. */
export function activePlan(
  sub: Subscription | null | undefined,
  now = Date.now(),
): Plan | null {
  return isActive(sub, now) ? sub!.plan : null;
}

/**
 * The perks, one predicate each.
 *
 * All four are cosmetic or convenience. NONE of them touches a score, XP, a
 * rank or matchmaking — that is the line the shop promises and the reason the
 * leaderboard is worth anything. tests/perks.test.ts asserts it.
 */

/** Full battle history rather than the last 20. */
export function hasFullHistory(sub: Subscription | null | undefined): boolean {
  return isActive(sub);
}

/** A coloured ring around the avatar, in the plan's colour. */
export function hasAvatarFrame(sub: Subscription | null | undefined): boolean {
  return isActive(sub);
}

/** The username rendered in the plan's colour on the leaderboard. */
export function hasColouredName(sub: Subscription | null | undefined): boolean {
  return isActive(sub);
}

/** The extra breakdown on /compte: ratios, averages, per-exercise split. */
export function hasDetailedStats(sub: Subscription | null | undefined): boolean {
  return isActive(sub);
}

/**
 * Tailwind classes for the plan's accent, or null.
 *
 * One place, so the frame, the name and the badge cannot drift apart into
 * three slightly different golds.
 */
export function planAccent(
  sub: Subscription | null | undefined,
): { ring: string; text: string } | null {
  const plan = activePlan(sub);
  if (!plan) return null;
  return plan === 'premium'
    ? { ring: 'ring-volt-500', text: 'text-volt-400' }
    : { ring: 'ring-gold', text: 'text-gold' };
}

/** Label for the badge shown on the profile and the leaderboard. */
export function planLabel(plan: Plan): string {
  return plan === 'premium' ? 'Premium' : 'Soutien';
}

/** How many battles the account may load. */
export const FREE_HISTORY = 20;
export const FULL_HISTORY = 200;

export function historyLimit(sub: Subscription | null | undefined): number {
  return hasFullHistory(sub) ? FULL_HISTORY : FREE_HISTORY;
}
