import { describe, expect, it } from 'vitest';
import {
  FREE_HISTORY,
  FULL_HISTORY,
  activePlan,
  hasFullHistory,
  historyLimit,
  isActive,
  planLabel,
  type Subscription,
} from '../src/lib/subscription';

/**
 * Whether a subscription grants its perks.
 *
 * The failure that matters is granting a perk that was not paid for — an
 * expired plan, a cancelled one, or a webhook that never arrived. Every case
 * below leans towards denying.
 */

const HOUR = 3_600_000;
const at = (ms: number) => ({ seconds: Math.floor(ms / 1000) });

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  plan: 'premium',
  status: 'active',
  currentPeriodEnd: at(Date.now() + 30 * 24 * HOUR),
  ...over,
});

describe('what grants access', () => {
  it('grants an active plan inside its period', () => {
    expect(isActive(sub())).toBe(true);
    expect(activePlan(sub())).toBe('premium');
  });

  it('grants a trial', () => {
    expect(isActive(sub({ status: 'trialing' }))).toBe(true);
  });

  it('keeps access during a failed payment retry', () => {
    // Stripe retries for days. Cutting someone off on the first failure
    // punishes an expired card, which is not the same as not paying.
    expect(isActive(sub({ status: 'past_due' }))).toBe(true);
  });

  it('keeps access after cancelling, until the period runs out', () => {
    // They paid for the month. Cancelling ends the renewal, not the month.
    expect(isActive(sub({ cancelAtPeriodEnd: true }))).toBe(true);
  });
});

describe('what does not', () => {
  it('denies with no subscription at all', () => {
    expect(isActive(null)).toBe(false);
    expect(isActive(undefined)).toBe(false);
    expect(activePlan(null)).toBeNull();
  });

  it('denies once the period has elapsed', () => {
    expect(isActive(sub({ currentPeriodEnd: at(Date.now() - HOUR) }))).toBe(false);
  });

  it('denies an elapsed period even while the status still says active', () => {
    // The case that matters: a `subscription.deleted` webhook that never
    // arrived would otherwise grant perks forever. The date is the backstop.
    const stale = sub({
      status: 'active',
      currentPeriodEnd: at(Date.now() - 90 * 24 * HOUR),
    });
    expect(isActive(stale)).toBe(false);
  });

  it('denies a cancelled plan', () => {
    expect(isActive(sub({ status: 'canceled' }))).toBe(false);
  });

  it('denies an incomplete checkout', () => {
    // Card entered, payment never confirmed.
    expect(isActive(sub({ status: 'incomplete' }))).toBe(false);
  });

  it('denies when there is no period end to check', () => {
    // Cannot prove it is valid, so it is not. Granting a perk wrongly is worse
    // than asking someone to subscribe again.
    expect(isActive(sub({ currentPeriodEnd: null }))).toBe(false);
  });

  it('denies exactly at the boundary, not a millisecond after', () => {
    const now = Date.now();
    const boundary = sub({ currentPeriodEnd: at(now) });
    expect(isActive(boundary, now + 1)).toBe(false);
  });
});

describe('history perk', () => {
  it('gives the free limit without a plan', () => {
    expect(historyLimit(null)).toBe(FREE_HISTORY);
    expect(hasFullHistory(null)).toBe(false);
  });

  it('gives the full limit with an active plan', () => {
    expect(historyLimit(sub())).toBe(FULL_HISTORY);
    expect(hasFullHistory(sub())).toBe(true);
  });

  it('falls back to the free limit once the plan lapses', () => {
    const expired = sub({ currentPeriodEnd: at(Date.now() - HOUR) });
    expect(historyLimit(expired)).toBe(FREE_HISTORY);
  });

  it('offers more than the free tier, or the perk is a lie', () => {
    expect(FULL_HISTORY).toBeGreaterThan(FREE_HISTORY);
  });
});

describe('labels', () => {
  it('names both plans', () => {
    expect(planLabel('premium')).toBe('Premium');
    expect(planLabel('soutien')).toBe('Soutien');
  });

  it('reports the plan that is actually active', () => {
    expect(activePlan(sub({ plan: 'soutien' }))).toBe('soutien');
    expect(activePlan(sub({ plan: 'soutien', status: 'canceled' }))).toBeNull();
  });
});
