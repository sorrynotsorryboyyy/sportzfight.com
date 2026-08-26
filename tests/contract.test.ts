import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  ABANDON_WAITING_MS,
  COUNTDOWN_MS,
  FINISH_SLACK_MS,
  MAX_SCORE,
  MAX_SCORE_JUMP,
  SCORE_GRACE_MS,
  STALE_LIVE_MS,
  STALE_MS,
} from '../src/lib/battle/constants';
import {
  COINS,
  DAILY_GOAL_BATTLES,
  DAILY_GOAL_COINS,
  PR_BONUS,
  STREAK_3_COINS,
  STREAK_7_COINS,
  STREAK_GRACE_HOURS,
  STREAK_WINDOW_HOURS,
  XP_BASE,
  XP_PER_REP,
  bonusForStreak,
} from '../src/lib/progression/awards';

/**
 * firestore.rules cannot import TypeScript, so a handful of numbers are written
 * out twice: once here for the client, once there for the server. Nothing
 * enforces that they stay equal.
 *
 * A drift does not throw. The rule simply refuses every write that depends on
 * it, silently — a battle that will not finish, or XP that never lands, with no
 * error anywhere. That failure mode is why these tests exist: they turn a mute
 * outage into a red test.
 *
 * These read the rules file as text rather than evaluating it, which is enough:
 * the values are literals in single-line helper functions.
 */

const RULES = readFileSync('firestore.rules', 'utf8');

/** Pull `function name() { return 42; }` out of the rules source. */
function ruleValue(fn: string): number {
  const m = RULES.match(
    new RegExp(`function\\s+${fn}\\s*\\(\\)\\s*\\{\\s*return\\s+(-?\\d+)\\s*;`),
  );
  if (!m) throw new Error(`rules helper ${fn}() not found in firestore.rules`);
  return Number(m[1]);
}

describe('timing contract: constants.ts ↔ firestore.rules', () => {
  const SECONDS: Array<[string, string, number]> = [
    ['COUNTDOWN_MS', 'countdownSecs', COUNTDOWN_MS],
    ['SCORE_GRACE_MS', 'scoreGraceSecs', SCORE_GRACE_MS],
    ['FINISH_SLACK_MS', 'finishSlackSecs', FINISH_SLACK_MS],
    ['STALE_MS', 'staleSecs', STALE_MS],
    ['STALE_LIVE_MS', 'staleLiveSecs', STALE_LIVE_MS],
    ['ABANDON_WAITING_MS', 'abandonWaitSecs', ABANDON_WAITING_MS],
  ];

  it.each(SECONDS)('%s matches %s() in the rules', (_name, fn, ms) => {
    expect(ruleValue(fn)).toBe(ms / 1000);
  });

  it('MAX_SCORE matches maxScore()', () => {
    expect(ruleValue('maxScore')).toBe(MAX_SCORE);
  });

  it('MAX_SCORE_JUMP matches maxJump()', () => {
    expect(ruleValue('maxJump')).toBe(MAX_SCORE_JUMP);
  });
});

describe('award contract: awards.ts ↔ firestore.rules', () => {
  // These decide how much XP a battle pays. A mismatch means every credit
  // write is denied and players silently stop earning anything.
  it.each([
    ['win', 'xpWin', XP_BASE.win],
    ['draw', 'xpDraw', XP_BASE.draw],
    ['loss', 'xpLoss', XP_BASE.loss],
  ])('XP for a %s matches %s()', (_o, fn, value) => {
    expect(ruleValue(fn)).toBe(value);
  });

  it.each([
    ['win', 'coinsWin', COINS.win],
    ['draw', 'coinsDraw', COINS.draw],
    ['loss', 'coinsLoss', COINS.loss],
  ])('coins for a %s matches %s()', (_o, fn, value) => {
    expect(ruleValue(fn)).toBe(value);
  });

  it('XP_PER_REP matches xpPerRep()', () => {
    expect(ruleValue('xpPerRep')).toBe(XP_PER_REP);
  });

  it('PR_BONUS matches prBonus()', () => {
    expect(ruleValue('prBonus')).toBe(PR_BONUS);
  });
});

describe('daily bonus contract: awards.ts <-> firestore.rules', () => {
  // The streak is the retention mechanism and pays far more than a battle, so
  // a drift here is both a silent outage and an economy bug.
  it.each([
    ['dailyGoalCoins', DAILY_GOAL_COINS],
    ['dailyGoalBattles', DAILY_GOAL_BATTLES],
    ['streak3Coins', STREAK_3_COINS],
    ['streak7Coins', STREAK_7_COINS],
  ])('%s() matches its TS twin', (fn, value) => {
    expect(ruleValue(fn)).toBe(value);
  });

  it('the rolling window and grace period match, in seconds', () => {
    expect(ruleValue('streakWindowSecs')).toBe(STREAK_WINDOW_HOURS * 3600);
    expect(ruleValue('streakGraceSecs')).toBe(STREAK_GRACE_HOURS * 3600);
  });

  it('the window is shorter than the grace period', () => {
    // Otherwise a streak would expire before it could next be claimed, and
    // nobody could ever reach day 2.
    expect(STREAK_WINDOW_HOURS).toBeLessThan(STREAK_GRACE_HOURS);
  });

  it('bonusForStreak agrees with the tiers the rules compute', () => {
    // The rules recompute this from the same three constants; if the TS
    // reimplementation drifts, every payout is denied.
    const fromRules = (n: number) =>
      DAILY_GOAL_COINS +
      (n % 3 === 0 ? STREAK_3_COINS : 0) +
      (n % 7 === 0 ? STREAK_7_COINS : 0);
    for (let n = 1; n <= 60; n++) {
      expect(bonusForStreak(n)).toBe(fromRules(n));
    }
  });
});

describe('the guard itself works', () => {
  // If the extractor silently returned a default, every test above would pass
  // no matter what the rules said. Prove it fails loudly on a missing helper.
  it('throws when a rules helper is missing rather than passing quietly', () => {
    expect(() => ruleValue('noSuchHelperExists')).toThrow(/not found/);
  });

  it('reads a real value rather than always returning the same number', () => {
    // Two helpers with genuinely different values, so a stubbed-out reader
    // cannot satisfy both.
    expect(ruleValue('maxScore')).not.toBe(ruleValue('maxJump'));
  });
});
