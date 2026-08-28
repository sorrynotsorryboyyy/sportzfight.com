import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bpsToPercent,
  commissionFor,
  defaultRates,
  isValidCode,
  normaliseCode,
} from '../src/lib/partners/commission';
import {
  PAYOUT_MINIMUM_CENTS,
  RATE_FIRST_BPS,
  RATE_RECURRING_BPS,
} from '../src/lib/partners/types';

/**
 * This decides how much real money leaves the account, so the tests lean
 * towards paying LESS rather than more when anything is ambiguous.
 */

const partner = (over = {}) => ({
  rateFirstBps: RATE_FIRST_BPS,
  rateRecurringBps: RATE_RECURRING_BPS,
  active: true,
  ...over,
});

/** Premium is 5,99 € and Soutien 9,99 € — the two real prices. */
const PREMIUM = 599;
const SOUTIEN = 999;

describe('the flat rate', () => {
  it('pays 25% on the first invoice', () => {
    expect(commissionFor({ amountCents: PREMIUM, partner: partner(), isFirstPayment: true }))
      .toEqual({ commissionCents: 150, commissionBps: 2500 });
  });

  it('pays the same 25% on every renewal', () => {
    expect(commissionFor({ amountCents: PREMIUM, partner: partner(), isFirstPayment: false }))
      .toEqual({ commissionCents: 150, commissionBps: 2500 });
  });

  it('scales with the plan', () => {
    expect(
      commissionFor({ amountCents: SOUTIEN, partner: partner(), isFirstPayment: true })
        .commissionCents,
    ).toBe(250);
    expect(
      commissionFor({ amountCents: SOUTIEN, partner: partner(), isFirstPayment: false })
        .commissionCents,
    ).toBe(250);
  });

  it('pays 1,50 € on a Premium and 2,50 € on a Soutien', () => {
    // The two real prices, in the units the operator thinks in. 599 * 0.25 is
    // 149.75 and 999 * 0.25 is 249.75 — both land on a half cent, so this is
    // also the rounding rule applied to the only two amounts that matter.
    expect(commissionFor({ amountCents: 599, partner: partner(), isFirstPayment: true })
      .commissionCents).toBe(150);
    expect(commissionFor({ amountCents: 999, partner: partner(), isFirstPayment: true })
      .commissionCents).toBe(250);
  });

  it('pays the same on the first invoice as on a renewal', () => {
    // Replaces 'pays more on the first invoice than on a renewal'. That test
    // asserted a PRODUCT decision — the 12%/7% tier — rather than arithmetic,
    // so dropping the tier had to invert it rather than retune it.
    const first = commissionFor({ amountCents: PREMIUM, partner: partner(), isFirstPayment: true });
    const later = commissionFor({ amountCents: PREMIUM, partner: partner(), isFirstPayment: false });
    expect(first).toEqual(later);
  });

  it('honours a negotiated rate rather than the default', () => {
    // Rates live on the partner so a big gym can be given better terms.
    //
    // Deliberately ASYMMETRIC, and this is now the only test proving the two
    // fields are still read independently. Delete it and collapsing them into
    // one field starts to look free.
    const vip = partner({ rateFirstBps: 4000, rateRecurringBps: 2500 });
    expect(commissionFor({ amountCents: 1000, partner: vip, isFirstPayment: true }).commissionCents)
      .toBe(400);
    expect(commissionFor({ amountCents: 1000, partner: vip, isFirstPayment: false }).commissionCents)
      .toBe(250);
  });

  it('records the rate it applied, for auditing later', () => {
    // Rates can change; a payout made last year must stay explicable.
    expect(commissionFor({ amountCents: PREMIUM, partner: partner(), isFirstPayment: true })
      .commissionBps).toBe(2500);
    expect(commissionFor({ amountCents: PREMIUM, partner: partner(), isFirstPayment: false })
      .commissionBps).toBe(2500);
  });
});

describe('nothing is owed when nobody referred', () => {
  it('pays nothing without a partner', () => {
    expect(commissionFor({ amountCents: PREMIUM, partner: null, isFirstPayment: true }))
      .toEqual({ commissionCents: 0, commissionBps: 0 });
  });

  it('pays nothing to a deactivated partner', () => {
    // Deactivating keeps the history but stops the earning.
    expect(commissionFor({
      amountCents: PREMIUM,
      partner: partner({ active: false }),
      isFirstPayment: true,
    }).commissionCents).toBe(0);
  });

  it('pays nothing on a zero rate', () => {
    expect(commissionFor({
      amountCents: PREMIUM,
      partner: partner({ rateFirstBps: 0 }),
      isFirstPayment: true,
    }).commissionCents).toBe(0);
  });
});

describe('refunds and bad input never cost money', () => {
  it('never returns a negative commission', () => {
    // A refund arriving as a negative amount must not claw money back out of a
    // partner's balance behind their back.
    for (const amount of [-1, -599, -100_000]) {
      expect(commissionFor({ amountCents: amount, partner: partner(), isFirstPayment: true })
        .commissionCents).toBe(0);
    }
  });

  it('pays nothing on a zero invoice', () => {
    // A 100%-discounted invoice still fires invoice.paid.
    expect(commissionFor({ amountCents: 0, partner: partner(), isFirstPayment: true })
      .commissionCents).toBe(0);
  });

  it('survives NaN and Infinity rather than writing one to the ledger', () => {
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const r = commissionFor({ amountCents: amount, partner: partner(), isFirstPayment: true });
      expect(r.commissionCents).toBe(0);
      expect(Number.isFinite(r.commissionCents)).toBe(true);
    }
  });
});

describe('rounding', () => {
  it('always returns whole cents', () => {
    for (let amount = 1; amount <= 20_000; amount += 7) {
      for (const first of [true, false]) {
        const { commissionCents } = commissionFor({
          amountCents: amount,
          partner: partner(),
          isFirstPayment: first,
        });
        expect(Number.isInteger(commissionCents)).toBe(true);
      }
    }
  });

  it('never pays out more than the invoice itself', () => {
    // The obvious catastrophe: a rounding bug that pays 100%+ of revenue away.
    for (let amount = 1; amount <= 20_000; amount += 13) {
      const { commissionCents } = commissionFor({
        amountCents: amount,
        partner: partner(),
        isFirstPayment: true,
      });
      expect(commissionCents).toBeLessThanOrEqual(amount);
    }
  });

  it('stays within a cent of the exact percentage', () => {
    for (let amount = 1; amount <= 5000; amount += 3) {
      const { commissionCents } = commissionFor({
        amountCents: amount,
        partner: partner(),
        isFirstPayment: false,
      });
      // The constant, not a literal: this used to hardcode 700 and was a second
      // place the rate was written down.
      expect(
        Math.abs(commissionCents - (amount * RATE_RECURRING_BPS) / 10_000),
      ).toBeLessThanOrEqual(0.5);
    }
  });

  it('rounds a half cent up', () => {
    // 25% of 2 is exactly 0.5.
    expect(commissionFor({ amountCents: 2, partner: partner(), isFirstPayment: false })
      .commissionCents).toBe(1);
  });
});

describe('codes', () => {
  it('uppercases and strips punctuation', () => {
    expect(normaliseCode('fit-pro ')).toBe('FITPRO');
    expect(normaliseCode('  salle_42  ')).toBe('SALLE42');
    expect(normaliseCode('Coach.Marie')).toBe('COACHMARIE');
  });

  it('is idempotent, so a stored code never drifts', () => {
    for (const raw of ['fit-pro', 'SALLE 42', 'a.b.c']) {
      expect(normaliseCode(normaliseCode(raw))).toBe(normaliseCode(raw));
    }
  });

  it('caps the length', () => {
    expect(normaliseCode('A'.repeat(50))).toHaveLength(20);
  });

  it('rejects codes too short to be deliberate', () => {
    expect(isValidCode('AB')).toBe(false);
    expect(isValidCode('!!')).toBe(false);
    expect(isValidCode('')).toBe(false);
  });

  it('accepts a realistic code', () => {
    expect(isValidCode('FITPRO')).toBe(true);
    expect(isValidCode('coach-marie')).toBe(true);
  });
});

describe('programme settings', () => {
  it('starts partners on a flat 25%', () => {
    expect(defaultRates()).toEqual({ rateFirstBps: 2500, rateRecurringBps: 2500 });
  });

  it('reads rates back as percentages for display', () => {
    expect(bpsToPercent(RATE_FIRST_BPS)).toBe(25);
    expect(bpsToPercent(RATE_RECURRING_BPS)).toBe(25);
  });

  it('keeps the ledger frozen when the default rate moves', () => {
    /**
     * The question this answers is "did changing the rate just repay everyone
     * at 25%?", and the answer has to be structural rather than merely true
     * today. commissionFor is a pure function of what it is HANDED, so a
     * historical row replayed with its own stored rate reproduces its own
     * historical amount — the current default cannot reach it.
     *
     * The other two guards live outside this file: the webhook returns early on
     * an invoice it has already seen, and firestore.rules denies every client
     * write to `payments`.
     */
    const asWritten = { rateFirstBps: 1200, rateRecurringBps: 700, active: true };
    expect(commissionFor({ amountCents: 599, partner: asWritten, isFirstPayment: true }))
      .toEqual({ commissionCents: 72, commissionBps: 1200 });
    expect(commissionFor({ amountCents: 599, partner: asWritten, isFirstPayment: false }))
      .toEqual({ commissionCents: 42, commissionBps: 700 });
  });

  it('sets a payout minimum that is worth a bank transfer', () => {
    expect(PAYOUT_MINIMUM_CENTS).toBeGreaterThan(0);
    // Earning starts at the first referral; only the transfer waits.
    expect(commissionFor({ amountCents: PREMIUM, partner: partner(), isFirstPayment: true })
      .commissionCents).toBeGreaterThan(0);
  });
});

describe('every partner is created through the code lock', () => {
  /**
   * Two routes create partners: the admin form and application approval. They
   * used to hold two copies of a `where('code','==',code)` check followed by an
   * `add()`, which is not atomic — two admins creating FITPRO in the same
   * second both saw an empty result and both wrote.
   *
   * The consequence was silent and it was money: /api/referral and /p/[code]
   * both resolve a code with limit(1), so one of the two partners would collect
   * every one of the other's referrals while both dashboards looked fine.
   *
   * Asserted on the source because the failure is a missing transaction, and a
   * unit test cannot see the absence of one. Same technique as the dependency
   * guard in bot.test.ts.
   */
  const ROUTES = [
    'src/app/api/admin/partners/route.ts',
    'src/app/api/admin/applications/route.ts',
  ];

  it.each(ROUTES)('%s calls createPartner', (path) => {
    expect(readFileSync(path, 'utf8')).toContain('createPartner(');
  });

  it.each(ROUTES)('%s no longer writes the collection directly', (path) => {
    const src = readFileSync(path, 'utf8');
    expect(
      src.includes(".collection('partners').add("),
      'a direct add() bypasses the code lock',
    ).toBe(false);
  });

  it('claims the lock inside a transaction', () => {
    // runTransaction is what makes the read-then-write atomic. Without it the
    // lock document is decoration.
    const src = readFileSync('src/lib/server/partners.ts', 'utf8');
    expect(src).toContain('runTransaction');
    expect(src).toContain('partnerCodes/');
  });
});
