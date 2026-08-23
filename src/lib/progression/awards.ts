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

/** SportzCoins ($SC). No sink yet; the balance simply accrues for now. */
export const COINS: Record<Outcome, number> = {
  win: 25,
  draw: 15,
  loss: 10,
};

export const xpFor = (outcome: Outcome, reps: number): number =>
  XP_BASE[outcome] + Math.max(0, reps) * XP_PER_REP;

export const coinsFor = (outcome: Outcome): number => COINS[outcome];

/** Resolve a battle's stored winner into this player's outcome. */
export function outcomeFor(
  winner: string | 'draw' | null,
  uid: string,
): Outcome {
  if (winner === 'draw' || winner === null) return 'draw';
  return winner === uid ? 'win' : 'loss';
}
