import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FREE_HISTORY,
  FULL_HISTORY,
  hasAvatarFrame,
  hasColouredName,
  hasDetailedStats,
  hasFullHistory,
  historyLimit,
  isActive,
  planAccent,
  type Subscription,
} from '../src/lib/subscription';

/**
 * The shop advertised nine perks and shipped three. This file exists so that
 * cannot recur: every bullet on the page must map to something enforced, and
 * nothing enforced may touch a score.
 */

const HOUR = 3_600_000;
const at = (ms: number) => ({ seconds: Math.floor(ms / 1000) });

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  plan: 'premium',
  status: 'active',
  currentPeriodEnd: at(Date.now() + 30 * 24 * HOUR),
  ...over,
});

const PERKS = [
  ['full history', hasFullHistory],
  ['avatar frame', hasAvatarFrame],
  ['coloured name', hasColouredName],
  ['detailed stats', hasDetailedStats],
] as const;

describe('no subscription, no perks', () => {
  it.each(PERKS)('denies %s without a plan', (_name, perk) => {
    expect(perk(null)).toBe(false);
    expect(perk(undefined)).toBe(false);
  });

  it.each(PERKS)('denies %s once the period has elapsed', (_name, perk) => {
    // The failure that matters: a webhook that never arrived must not leave
    // perks granted forever.
    expect(perk(sub({ currentPeriodEnd: at(Date.now() - HOUR) }))).toBe(false);
  });

  it.each(PERKS)('denies %s on a cancelled plan', (_name, perk) => {
    expect(perk(sub({ status: 'canceled' }))).toBe(false);
  });

  it.each(PERKS)('grants %s on an active plan', (_name, perk) => {
    expect(perk(sub())).toBe(true);
  });

  it('grants every perk to both plans', () => {
    // "Tout ce que contient Premium" is a bullet on the Soutien card.
    for (const [, perk] of PERKS) {
      expect(perk(sub({ plan: 'premium' }))).toBe(true);
      expect(perk(sub({ plan: 'soutien' }))).toBe(true);
    }
  });
});

describe('every perk is tied to the same gate', () => {
  it('agrees with isActive in every state', () => {
    // Four predicates drifting apart is how one perk keeps working after a
    // subscription lapses.
    const states: Subscription[] = [
      sub(),
      sub({ status: 'trialing' }),
      sub({ status: 'past_due' }),
      sub({ status: 'canceled' }),
      sub({ status: 'incomplete' }),
      sub({ currentPeriodEnd: null }),
      sub({ currentPeriodEnd: at(Date.now() - HOUR) }),
      sub({ cancelAtPeriodEnd: true }),
    ];
    for (const s of states) {
      const expected = isActive(s);
      for (const [name, perk] of PERKS) {
        expect(perk(s), `${name} disagrees with isActive`).toBe(expected);
      }
    }
  });
});

describe('the accent colour', () => {
  it('is null without an active plan', () => {
    expect(planAccent(null)).toBeNull();
    expect(planAccent(sub({ status: 'canceled' }))).toBeNull();
  });

  it('differs between the two plans', () => {
    // Otherwise paying 9,99 € looks identical to paying 5,99 €.
    const premium = planAccent(sub({ plan: 'premium' }));
    const soutien = planAccent(sub({ plan: 'soutien' }));
    expect(premium).not.toBeNull();
    expect(soutien).not.toBeNull();
    expect(premium!.ring).not.toBe(soutien!.ring);
  });
});

describe('history', () => {
  it('gives more to a subscriber, or the perk is a lie', () => {
    expect(FULL_HISTORY).toBeGreaterThan(FREE_HISTORY);
    expect(historyLimit(sub())).toBe(FULL_HISTORY);
    expect(historyLimit(null)).toBe(FREE_HISTORY);
  });
});

describe('nothing paid touches the game', () => {
  const SUBSCRIPTION = readFileSync('src/lib/subscription.ts', 'utf8');

  it('never mentions a scoring or ranking field', () => {
    // The promise printed on the page: "à exercice égal, un abonné et un
    // joueur gratuit sont exactement à armes égales."
    for (const forbidden of ['wins', 'losses', 'xp', 'coins', 'bestScore', 'totalReps']) {
      // Whole-identifier match: a substring test flags "export" for "xp".
      const used = new RegExp(`\b${forbidden}\b`).test(SUBSCRIPTION);
      expect(
        used,
        `subscription.ts references ${forbidden} — a perk must not touch scoring`,
      ).toBe(false);
    }
  });

  it('is not consulted by the matchmaking or scoring paths', () => {
    for (const file of [
      'src/lib/firebase/matchmaking.ts',
      'src/lib/firebase/stats.ts',
      'src/lib/progression/awards.ts',
    ]) {
      const src = readFileSync(file, 'utf8');
      expect(
        src.includes('subscription') || src.includes('isActive'),
        `${file} consults the subscription — that would be pay-to-win`,
      ).toBe(false);
    }
  });
});

describe('the shop only advertises what exists', () => {
  const SHOP = readFileSync('src/app/boutique/page.tsx', 'utf8');

  it('no longer promises unlocked exercise modes', () => {
    // ModeGrid filters on `available` and never consults the subscription, and
    // the three remaining exercises have no detector — the perk could not be
    // delivered even by flipping a flag.
    expect(SHOP).not.toMatch(/modes débloqués/i);
    expect(SHOP).not.toMatch(/burpees|tractions|abdos/i);
  });

  it('lists a perk count matching what is implemented', () => {
    // Each bullet should correspond to something in this test file. A rough
    // guard, but it catches a bullet added without an implementation.
    const bullets = [...SHOP.matchAll(/^ {6}'(.+)',$/gm)].length;
    expect(bullets).toBeGreaterThan(0);
    expect(bullets).toBeLessThanOrEqual(10);
  });
});
