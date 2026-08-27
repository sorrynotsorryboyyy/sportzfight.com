import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOT_LEVEL_MIN_BATTLES,
  BOT_MAX_REPS,
  BOT_MIN_REPS,
  botLevelFor,
  botName,
  botScoreAt,
  curveIsWritable,
  planBot,
  type BotLevel,
} from '../src/lib/battle/bot';
import {
  DEFAULT_DURATION_SECS,
  HEARTBEAT_MS,
  MAX_SCORE,
  MAX_SCORE_JUMP,
  SCORE_FLUSH_MS,
} from '../src/lib/battle/constants';
import { BOT_JOIN_DELAY_MS } from '../src/lib/battle/useBotOpponent';

/**
 * The bot writes to a battle document the security rules police, so a curve
 * that breaks a rule does not error — it silently stops scoring, and the
 * player watches a frozen opponent.
 */

const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];
const SEEDS = [1, 7, 42, 99, 1234, 55555, 987654];

describe('the score the rules will accept', () => {
  it('never decreases', () => {
    // scoreOk() demands newV >= oldV. One dip and every later write is denied.
    for (const seed of SEEDS) {
      const plan = planBot(DEFAULT_DURATION_SECS, 'normal', seed);
      for (let i = 1; i < plan.curve.length; i++) {
        expect(plan.curve[i]).toBeGreaterThanOrEqual(plan.curve[i - 1]);
      }
    }
  });

  it('never jumps more than the rules allow between two flushes', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS) {
        const plan = planBot(DEFAULT_DURATION_SECS, level, seed);
        expect(curveIsWritable(plan, SCORE_FLUSH_MS)).toBe(true);
      }
    }
  });

  it('stays under the score ceiling', () => {
    for (const seed of SEEDS) {
      const plan = planBot(DEFAULT_DURATION_SECS, 'hard', seed);
      expect(plan.total).toBeLessThanOrEqual(MAX_SCORE);
    }
  });

  it('survives an absurd duration without exceeding the ceiling', () => {
    // durationSecs is capped at 600 by the rules; the curve must cope.
    const plan = planBot(600, 'hard', 42);
    expect(plan.total).toBeLessThanOrEqual(MAX_SCORE);
    expect(curveIsWritable(plan, SCORE_FLUSH_MS)).toBe(true);
  });
});

describe('the totals are plausible', () => {
  it('lands inside the human range', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS) {
        const plan = planBot(DEFAULT_DURATION_SECS, level, seed);
        expect(plan.total).toBeGreaterThanOrEqual(BOT_MIN_REPS);
        expect(plan.total).toBeLessThanOrEqual(BOT_MAX_REPS);
      }
    }
  });

  it('makes a hard bot beat an easy one on the same seed', () => {
    for (const seed of SEEDS) {
      const easy = planBot(DEFAULT_DURATION_SECS, 'easy', seed).total;
      const hard = planBot(DEFAULT_DURATION_SECS, 'hard', seed).total;
      expect(hard).toBeGreaterThan(easy);
    }
  });

  it('finishes exactly on its target', () => {
    // Stopping at 27 of an intended 28 reads as a bug to anyone watching.
    for (const seed of SEEDS) {
      const plan = planBot(DEFAULT_DURATION_SECS, 'normal', seed);
      expect(plan.curve[plan.curve.length - 1]).toBe(plan.total);
    }
  });

  it('starts from zero', () => {
    const plan = planBot(DEFAULT_DURATION_SECS, 'normal', 42);
    expect(plan.curve[0]).toBe(0);
    expect(botScoreAt(plan, 0)).toBe(0);
    expect(botScoreAt(plan, -500)).toBe(0);
  });
});

describe('it does not move like a machine', () => {
  it('slows down in the second half', () => {
    // A flat rate is the clearest tell that an opponent is not human.
    for (const seed of SEEDS) {
      const plan = planBot(DEFAULT_DURATION_SECS, 'normal', seed);
      const half = Math.floor(plan.curve.length / 2);
      const first = plan.curve[half];
      const second = plan.total - first;
      expect(first).toBeGreaterThan(second);
    }
  });

  it('gives two different battles for two different seeds', () => {
    const a = planBot(DEFAULT_DURATION_SECS, 'normal', 1);
    const b = planBot(DEFAULT_DURATION_SECS, 'normal', 2);
    expect(a.curve).not.toEqual(b.curve);
  });

  it('replays identically for the same seed', () => {
    // Deterministic, so a bug seen once can be reproduced.
    const a = planBot(DEFAULT_DURATION_SECS, 'normal', 4242);
    const b = planBot(DEFAULT_DURATION_SECS, 'normal', 4242);
    expect(a.curve).toEqual(b.curve);
    expect(a.total).toBe(b.total);
  });

  it('does not add a rep on every single tick', () => {
    // At ~30 reps over 600 ticks most steps must be flat, or the pacing is
    // impossible for a human body.
    const plan = planBot(DEFAULT_DURATION_SECS, 'normal', 42);
    const moves = plan.curve.filter((v, i) => i > 0 && v > plan.curve[i - 1]).length;
    expect(moves).toBeLessThan(plan.curve.length / 2);
  });
});

describe('reading the score mid-battle', () => {
  it('is monotonic over time', () => {
    const plan = planBot(DEFAULT_DURATION_SECS, 'normal', 7);
    let last = 0;
    for (let ms = 0; ms <= 60_000; ms += 250) {
      const v = botScoreAt(plan, ms);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it('holds the total after the battle ends', () => {
    const plan = planBot(DEFAULT_DURATION_SECS, 'normal', 7);
    expect(botScoreAt(plan, 60_000)).toBe(plan.total);
    expect(botScoreAt(plan, 999_999)).toBe(plan.total);
  });
});

describe('identity', () => {
  it('gives a stable name per seed', () => {
    expect(botName(42)).toBe(botName(42));
  });

  it('handles a negative seed without crashing', () => {
    expect(typeof botName(-99)).toBe('string');
    expect(botName(-99).length).toBeGreaterThan(0);
  });
});

describe('the contract with the rules', () => {
  it('keeps the jump ceiling meaningful', () => {
    // If MAX_SCORE_JUMP were ever lowered below what a bot emits, every bot
    // battle would freeze silently.
    const plan = planBot(DEFAULT_DURATION_SECS, 'hard', 1);
    const perFlush = Math.round(SCORE_FLUSH_MS / plan.stepMs);
    let worst = 0;
    for (let i = perFlush; i < plan.curve.length; i += perFlush) {
      worst = Math.max(worst, plan.curve[i] - plan.curve[i - perFlush]);
    }
    expect(worst).toBeLessThan(MAX_SCORE_JUMP);
  });
});

describe('the driver survives a changing document', () => {
  const HOOK = readFileSync('src/lib/battle/useBotOpponent.ts', 'utf8');

  /**
   * The bug that shipped: every effect depended on the whole battle document.
   * A heartbeat rewrites that document every 5 seconds, so the 8-second
   * seating timer was torn down and restarted forever and the bot never
   * arrived — the lobby waited exactly as it had before bots existed.
   *
   * Asserted on the source rather than by rendering: the failure is a
   * dependency-array mistake, which a render test would not see without a
   * fake Firestore emitting snapshots on a timer.
   */
  it('never depends on the whole battle object', () => {
    const deps = [...HOOK.matchAll(/\}, \[([^\]]*)\]\);/g)].map((m) => m[1]);
    expect(deps.length).toBeGreaterThan(0);
    for (const d of deps) {
      const names = d.split(',').map((x) => x.trim()).filter(Boolean);
      expect(
        names.includes('battle'),
        `an effect depends on \`battle\`, which the heartbeat rewrites every ${HEARTBEAT_MS / 1000}s`,
      ).toBe(false);
    }
  });

  it('waits longer than a heartbeat before seating', () => {
    // If the delay were shorter than the heartbeat the bug would have been
    // invisible, and a real player would have had no chance to take the seat.
    expect(BOT_JOIN_DELAY_MS).toBeGreaterThan(HEARTBEAT_MS);
  });
});

describe('bot difficulty follows the player', () => {
  /**
   * Bots shipped with a hardcoded 'normal' at the single call site, so 'easy'
   * and 'hard' existed only in this file. A beginner met a bot averaging 28
   * reps and lost every training battle; an advanced player met the same one
   * and never had a match. Both are reasons to stop playing.
   */

  it('uses the declared experience before there is any real result', () => {
    expect(botLevelFor({ experience: 'beginner', battlesPlayed: 0 })).toBe('easy');
    expect(botLevelFor({ experience: 'intermediate', battlesPlayed: 1 })).toBe('normal');
    expect(botLevelFor({ experience: 'advanced', battlesPlayed: 2 })).toBe('hard');
  });

  it('falls back to normal when onboarding was skipped', () => {
    // `experience` is optional: the welcome screen can be completed without it.
    expect(botLevelFor({ battlesPlayed: 0 })).toBe('normal');
    expect(botLevelFor({})).toBe('normal');
  });

  it('switches to real results at the third battle', () => {
    // An "advanced" self-assessment that produced 20 reps three times over is
    // a self-assessment we should stop believing.
    const claim = { experience: 'advanced', bestScore: 20 } as const;
    expect(botLevelFor({ ...claim, battlesPlayed: BOT_LEVEL_MIN_BATTLES - 1 })).toBe('hard');
    expect(botLevelFor({ ...claim, battlesPlayed: BOT_LEVEL_MIN_BATTLES })).toBe('easy');
  });

  it.each([
    [0, 'easy'],
    [18, 'easy'],
    [25, 'easy'],
    [26, 'normal'],
    [29, 'normal'],
    [32, 'normal'],
    [33, 'hard'],
    [40, 'hard'],
    [200, 'hard'],
  ] as const)('maps a best of %i to %s', (bestScore, want) => {
    expect(botLevelFor({ battlesPlayed: 10, bestScore })).toBe(want);
  });

  it('treats a veteran with no recorded best as easy, not hard', () => {
    // bestScore is optional on the document. Absent means nothing achieved,
    // and the safe direction for a player we know nothing about is the gentler
    // opponent: a walkover loss reads as "this app is not for me".
    expect(botLevelFor({ battlesPlayed: 5 })).toBe('easy');
  });

  it('returns a level while the profile is still loading', () => {
    /**
     * profile === null means LOADING in auth-context, not "no account". The
     * call site waits for it, but this must be total regardless — throwing
     * here would break matchmaking itself, not merely the difficulty.
     */
    expect(botLevelFor(null)).toBe('normal');
    expect(botLevelFor(undefined)).toBe('normal');
  });

  it('keeps every tier reachable', () => {
    // The invariant that would have caught the shipped bug: if any level is
    // unreachable from botLevelFor, it is dead code again.
    const reached = new Set(
      [0, 20, 26, 30, 33, 45].map((bestScore) =>
        botLevelFor({ battlesPlayed: 5, bestScore }),
      ),
    );
    expect(reached).toEqual(new Set<BotLevel>(['easy', 'normal', 'hard']));
  });

  it('gives a matched bot rather than a walkover in either direction', () => {
    // What "close match" means numerically: for a player sitting at the centre
    // of a tier, no seed may produce a bot more than six reps away from them.
    for (const [best, level] of [[22, 'easy'], [29, 'normal'], [36, 'hard']] as const) {
      expect(botLevelFor({ battlesPlayed: 5, bestScore: best })).toBe(level);
      for (const seed of SEEDS) {
        const total = planBot(DEFAULT_DURATION_SECS, level, seed).total;
        expect(Math.abs(total - best)).toBeLessThanOrEqual(6);
      }
    }
  });
});
