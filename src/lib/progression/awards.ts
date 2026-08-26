/**
 * XP and SportzCoin awards for a finished battle.
 *
 * IMPORTANT: firestore.rules hardcodes these same numbers (rules cannot import
 * TS), exactly like the timing contract in battle/constants.ts. If you change a
 * value here, change it in firestore.rules too — a mismatch does not throw, it
 * silently denies every credit write and players stop earning anything.
 */

export type Outcome = 'win' | 'loss' | 'draw';

/** Flat XP for the result itself. */
export const XP_BASE: Record<Outcome, number> = {
  win: 100,
  draw: 60,
  // Deliberately non-zero: a loss that pays nothing makes people quit rather
  // than rematch, which is the opposite of what a fitness app wants.
  loss: 40,
};

/**
 * XP per rep, on top of the result.
 *
 * This is the part that matters philosophically: it rewards effort the camera
 * actually measured, not just the outcome. Losing 45-48 earns 130 XP while
 * winning 12-9 earns 124 — the harder session pays more, as it should.
 */
export const XP_PER_REP = 2;

/**
 * SportzCoins ($SC) for the battle itself.
 *
 * Deliberately small. The old rate (25/15/10) let four battles a day earn
 * ~1600 $SC a month against a 380 $SC discount cap — the shop was exhausted in
 * a week and the balance then meant nothing. Playing more is no longer the way
 * to earn; coming back is. The bonuses below carry that weight.
 */
export const COINS: Record<Outcome, number> = {
  win: 3,
  draw: 2,
  // Never zero, for the same reason the XP floor is not zero: an unpaid loss
  // makes people quit rather than rematch.
  loss: 1,
};

/**
 * Paid on the battle that beats your own record.
 *
 * Deliberately modest. At 25 this was the single largest income for a
 * beginner — reps climb fast early, so the record falls most sessions and the
 * bonus became a per-session wage rather than an occasional reward. It should
 * mark progress, not fund the shop.
 */
export const PR_BONUS = 10;

/** Completing the daily objective: three battles inside one window. */
export const DAILY_GOAL_COINS = 5;
export const DAILY_GOAL_BATTLES = 3;

/** Streak milestones. */
export const STREAK_3_COINS = 10;
export const STREAK_7_COINS = 40;

/**
 * A "day" is a rolling 20-hour window, not a calendar day.
 *
 * Rules only know UTC, and a French player training at 23:00 would otherwise
 * see midnight fall mid-evening. A rolling window has no timezone at all, and
 * it is expressible with the same `request.time` arithmetic the battle clock
 * already relies on.
 */
export const STREAK_WINDOW_HOURS = 20;

/** Miss this long and the streak resets to 1. */
export const STREAK_GRACE_HOURS = 48;

/**
 * What the nth consecutive day pays.
 *
 * Tiered, not linear: a per-day increment compounds out of control (a first
 * pass reached 1549 $SC in a month against a 580 target). Tiers put the money
 * where breaking the streak hurts most.
 */
export function bonusForStreak(streak: number): number {
  if (streak <= 0) return 0;
  let coins = DAILY_GOAL_COINS;
  if (streak % 3 === 0) coins += STREAK_3_COINS;
  if (streak % 7 === 0) coins += STREAK_7_COINS;
  return coins;
}

export const xpFor = (outcome: Outcome, reps: number): number =>
  XP_BASE[outcome] + Math.max(0, reps) * XP_PER_REP;

export const coinsFor = (outcome: Outcome): number => COINS[outcome];

/**
 * Coins for one settled battle, personal-record bonus included.
 *
 * `previousBest` is the value BEFORE this battle: the rules compare against the
 * committed pre-image, so the client must too or the settle is denied.
 */
export function battleCoins(
  outcome: Outcome,
  reps: number,
  previousBest: number,
): number {
  return COINS[outcome] + (reps > previousBest ? PR_BONUS : 0);
}

/** Resolve a battle's stored winner into this player's outcome. */
export function outcomeFor(
  winner: string | 'draw' | null,
  uid: string,
): Outcome {
  if (winner === 'draw' || winner === null) return 'draw';
  return winner === uid ? 'win' : 'loss';
}
