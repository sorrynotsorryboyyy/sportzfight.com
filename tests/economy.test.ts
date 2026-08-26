import { describe, expect, it } from 'vitest';
import {
  COINS,
  DAILY_GOAL_BATTLES,
  PR_BONUS,
  STREAK_GRACE_HOURS,
  STREAK_WINDOW_HOURS,
  battleCoins,
  bonusForStreak,
} from '../src/lib/progression/awards';
import { maxDiscount, PRODUCTS } from '../src/lib/shop/catalog';

/**
 * The economy has one job: a regular player should unlock the full discount on
 * a mid-priced item after about a month, and the shop should still be worth
 * something in month two.
 *
 * The old rate failed both halves — four battles a day earned ~1600 $SC a month
 * against a 380 $SC cap, so the shop was exhausted in a week. These tests are
 * the guard against drifting back there, in either direction.
 */

interface Profile {
  battlesPerDay: number;
  /** Share of days the player shows up at all. */
  activeRate: number;
  winRate: number;
}

/**
 * Deterministic simulation of one player over `days`.
 *
 * Seeded rather than random: a flaky economy test would be worse than none,
 * and the point is a stable expectation, not a distribution.
 */
function simulate(p: Profile, days: number, seed = 1): number {
  // Small LCG — reproducible across machines, unlike Math.random.
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };

  let coins = 0;
  let streak = 0;
  let best = 0;

  for (let day = 1; day <= days; day++) {
    if (rand() >= p.activeRate) {
      streak = 0; // missed the window: the streak dies
      continue;
    }

    for (let b = 0; b < p.battlesPerDay; b++) {
      const outcome = rand() < p.winRate ? 'win' : 'loss';
      // Reps drift upward slowly, so records fall early then rarely — which is
      // what actually happens to a beginner.
      const reps = Math.round(20 + day * 0.4 + rand() * 6);
      coins += battleCoins(outcome, reps, best);
      best = Math.max(best, reps);
    }

    if (p.battlesPerDay >= DAILY_GOAL_BATTLES) {
      streak += 1;
      coins += bonusForStreak(streak);
    }
  }

  return coins;
}

const DEDICATED: Profile = { battlesPerDay: 4, activeRate: 0.95, winRate: 0.5 };
const REGULAR: Profile = { battlesPerDay: 3, activeRate: 0.85, winRate: 0.5 };
const CASUAL: Profile = { battlesPerDay: 2, activeRate: 0.5, winRate: 0.5 };

/** Average over several seeds, so one unlucky run cannot set the verdict. */
const monthly = (p: Profile, days = 30) =>
  Math.round([1, 7, 42, 99, 1234].reduce((s, seed) => s + simulate(p, days, seed), 0) / 5);

describe('the one-month target', () => {
  it('lets a dedicated player unlock a mid-priced item in a month', () => {
    // ~580 $SC is the cap on a 29 € shirt. That is the promise.
    const earned = monthly(DEDICATED);
    expect(earned).toBeGreaterThanOrEqual(450);
    expect(earned).toBeLessThanOrEqual(800);
  });

  it('lets a regular player reach the cheapest caps in a month', () => {
    const earned = monthly(REGULAR);
    const cheapest = Math.min(...PRODUCTS.map((p) => maxDiscount(p.priceCents).coins));
    expect(earned).toBeGreaterThan(cheapest);
  });

  it('does not exhaust the shop in the first month', () => {
    // The most expensive cap must stay out of reach at 30 days, or there is
    // nothing left to come back for.
    const dearest = Math.max(...PRODUCTS.map((p) => maxDiscount(p.priceCents).coins));
    expect(monthly(DEDICATED)).toBeLessThan(dearest);
  });

  it('puts the dearest cap within reach by three months', () => {
    // Out of reach is motivating; unreachable is not.
    const dearest = Math.max(...PRODUCTS.map((p) => maxDiscount(p.priceCents).coins));
    expect(monthly(DEDICATED, 90)).toBeGreaterThan(dearest);
  });

  it('pays a casual player something, but well short of a full cap', () => {
    const earned = monthly(CASUAL);
    expect(earned).toBeGreaterThan(0);
    const cheapest = Math.min(...PRODUCTS.map((p) => maxDiscount(p.priceCents).coins));
    expect(earned).toBeLessThan(cheapest);
  });
});

describe('regularity beats volume', () => {
  it('rewards showing up daily over grinding in bursts', () => {
    // The whole point of the redesign. Same battles, spread out versus piled
    // into half the days — the regular player must come out ahead.
    const spread = monthly({ battlesPerDay: 3, activeRate: 1, winRate: 0.5 });
    const burst = monthly({ battlesPerDay: 6, activeRate: 0.5, winRate: 0.5 });
    expect(spread).toBeGreaterThan(burst);
  });

  it('makes a day of battles worth less than the streak that carries it', () => {
    // Three wins pay 9 $SC; a 7th-day bonus pays 45. Volume must not dominate.
    const threeWins = 3 * COINS.win;
    expect(bonusForStreak(7)).toBeGreaterThan(threeWins);
  });
});

describe('the bonus curve', () => {
  it('pays nothing for a non-streak', () => {
    expect(bonusForStreak(0)).toBe(0);
    expect(bonusForStreak(-3)).toBe(0);
  });

  it('never pays less than the flat daily amount', () => {
    for (let n = 1; n <= 100; n++) {
      expect(bonusForStreak(n)).toBeGreaterThanOrEqual(bonusForStreak(1));
    }
  });

  it('peaks on the days a streak is most worth protecting', () => {
    // Day 21 hits both tiers at once: the strongest reason not to stop.
    expect(bonusForStreak(21)).toBe(bonusForStreak(3) + bonusForStreak(7) - bonusForStreak(1));
    expect(bonusForStreak(7)).toBeGreaterThan(bonusForStreak(6));
    expect(bonusForStreak(3)).toBeGreaterThan(bonusForStreak(2));
  });

  it('stays bounded — no runaway compounding', () => {
    // A linear per-day increment was the first attempt and it exploded.
    for (let n = 1; n <= 365; n++) {
      expect(bonusForStreak(n)).toBeLessThanOrEqual(bonusForStreak(21));
    }
  });
});

describe('the battle payout', () => {
  it('pays a loss, always', () => {
    // An unpaid loss makes people quit rather than rematch.
    expect(COINS.loss).toBeGreaterThan(0);
  });

  it('ranks win above draw above loss', () => {
    expect(COINS.win).toBeGreaterThan(COINS.draw);
    expect(COINS.draw).toBeGreaterThan(COINS.loss);
  });

  it('adds the record bonus only when the record actually falls', () => {
    expect(battleCoins('win', 30, 20)).toBe(COINS.win + PR_BONUS);
    expect(battleCoins('win', 30, 30)).toBe(COINS.win);
    expect(battleCoins('win', 30, 40)).toBe(COINS.win);
  });

  it('pays the record bonus on a loss too', () => {
    // Effort is what is being rewarded, not the outcome.
    expect(battleCoins('loss', 50, 10)).toBe(COINS.loss + PR_BONUS);
  });

  it('makes beating your own record worth more than winning', () => {
    expect(PR_BONUS).toBeGreaterThan(COINS.win);
  });
});

describe('the rolling window', () => {
  it('leaves room to claim before the streak lapses', () => {
    // A player has grace − window hours of slack. Too tight and honest players
    // lose streaks to a late evening.
    expect(STREAK_GRACE_HOURS - STREAK_WINDOW_HOURS).toBeGreaterThanOrEqual(24);
  });

  it('allows one claim a day, not two', () => {
    expect(STREAK_WINDOW_HOURS).toBeGreaterThan(12);
    expect(STREAK_WINDOW_HOURS).toBeLessThanOrEqual(24);
  });
});
