import { describe, expect, it } from 'vitest';
import {
  COINS,
  XP_BASE,
  XP_PER_REP,
  coinsFor,
  outcomeFor,
  xpFor,
} from '../src/lib/progression/awards';
import { levelFor, levelProgress, xpToReach } from '../src/lib/progression/level';
import {
  needsUsernameFix,
  sanitizeToUsername,
  usernameKey,
  validateUsername,
} from '../src/lib/utils/username';

/**
 * These numbers are duplicated in firestore.rules, which cannot import TS. A
 * mismatch does not throw — it silently denies every credit write and players
 * stop earning. The first test is the tripwire for that.
 */
describe('award contract', () => {
  it('matches the values hardcoded in firestore.rules', () => {
    expect(XP_BASE).toEqual({ win: 100, draw: 60, loss: 40 });
    expect(COINS).toEqual({ win: 25, draw: 15, loss: 10 });
    expect(XP_PER_REP).toBe(2);
  });

  it('pays the outcome plus effort', () => {
    expect(xpFor('win', 32)).toBe(164); // 100 + 64
    expect(xpFor('loss', 27)).toBe(94); // 40 + 54
    expect(xpFor('draw', 20)).toBe(100); // 60 + 40
  });

  it('rewards a hard-fought loss over an easy win', () => {
    // The deliberate incentive: effort the camera measured counts for more
    // than scraping a win. Losing 45-48 should beat winning 12-9.
    expect(xpFor('loss', 45)).toBeGreaterThan(xpFor('win', 12));
  });

  it('never pays zero for a loss', () => {
    expect(xpFor('loss', 0)).toBeGreaterThan(0);
    expect(coinsFor('loss')).toBeGreaterThan(0);
  });

  it('ignores a negative rep count', () => {
    expect(xpFor('win', -5)).toBe(100);
  });

  it('resolves the stored winner into an outcome', () => {
    expect(outcomeFor('me', 'me')).toBe('win');
    expect(outcomeFor('them', 'me')).toBe('loss');
    expect(outcomeFor('draw', 'me')).toBe('draw');
    expect(outcomeFor(null, 'me')).toBe('draw');
  });
});

describe('levels', () => {
  it('starts everyone at level 1', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(-100)).toBe(1);
    expect(levelFor(Number.NaN)).toBe(1);
  });

  it('matches the documented thresholds', () => {
    const expected: Array<[number, number]> = [
      [1, 0],
      [2, 100],
      [3, 300],
      [4, 600],
      [5, 1000],
      [10, 4500],
    ];
    for (const [lvl, xp] of expected) {
      expect(xpToReach(lvl), `xpToReach(${lvl})`).toBe(xp);
      expect(levelFor(xp), `levelFor(${xp})`).toBe(lvl);
      // One XP short must still be the previous level.
      if (xp > 0) expect(levelFor(xp - 1)).toBe(lvl - 1);
    }
  });

  it('never goes backwards as xp grows', () => {
    let prev = 1;
    for (let xp = 0; xp < 30_000; xp += 37) {
      const l = levelFor(xp);
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });

  it('reports progress within the current level', () => {
    const p = levelProgress(150); // level 2 spans 100..300
    expect(p.level).toBe(2);
    expect(p.xpIntoLevel).toBe(50);
    expect(p.xpForLevel).toBe(200);
    expect(p.xpToNext).toBe(150);
    expect(p.progress).toBeCloseTo(0.25, 5);
  });

  it('is exactly 0 progress on hitting a new level', () => {
    const p = levelProgress(xpToReach(5));
    expect(p.level).toBe(5);
    expect(p.xpIntoLevel).toBe(0);
    expect(p.progress).toBe(0);
  });

  it('reaches level 2 after roughly one battle', () => {
    // A typical win is ~160 XP, so the first battle should level you up.
    expect(levelFor(xpFor('win', 30))).toBe(2);
  });
});

describe('usernames', () => {
  it('rescues a Google display name instead of mangling it', () => {
    expect(sanitizeToUsername('Léo Chevalier')).toBe('LeoChevalier');
    expect(sanitizeToUsername('José-María 99')).toBe('JoseMaria99');
  });

  it('falls back when nothing usable survives', () => {
    expect(sanitizeToUsername('🔥🔥')).toBe('Athlete');
    expect(sanitizeToUsername('')).toBe('Athlete');
    expect(sanitizeToUsername('...')).toBe('Athlete');
  });

  it('always produces something the charset accepts', () => {
    for (const raw of ['Léo Chevalier', '123abc', '🔥', 'x', 'A very long name indeed']) {
      expect(validateUsername(sanitizeToUsername(raw)), raw).toBeNull();
    }
  });

  it('accepts reasonable names', () => {
    for (const n of ['Rocky', 'Rocky_99', 'aXb', 'A'.repeat(16)]) {
      expect(validateUsername(n), n).toBeNull();
    }
  });

  it('rejects what the charset forbids', () => {
    expect(validateUsername('Ro')).toBe('too-short');
    expect(validateUsername('a'.repeat(17))).toBe('too-long');
    expect(validateUsername('1Rocky')).toBe('bad-start');
    expect(validateUsername('Roc ky')).toBe('bad-chars');
    expect(validateUsername('Léo')).toBe('bad-chars');
    expect(validateUsername('Roc-ky')).toBe('bad-chars');
  });

  it('blocks profanity, including separator-spaced attempts', () => {
    expect(validateUsername('fuck')).toBe('profanity');
    expect(validateUsername('f_u_c_k')).toBe('profanity');
    expect(validateUsername('AdminGuy')).toBe('profanity');
  });

  it('is case-insensitive for uniqueness', () => {
    expect(usernameKey('RoCkY')).toBe(usernameKey('rocky'));
  });

  it('flags exactly the legacy names that need fixing', () => {
    expect(needsUsernameFix('Léo Chevalier')).toBe(true);
    expect(needsUsernameFix('Leo Chevalier')).toBe(true);
    expect(needsUsernameFix('LeoChevalier')).toBe(false);
    expect(needsUsernameFix(null)).toBe(false);
  });
});
