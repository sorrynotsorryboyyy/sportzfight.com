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

describe('the two rates', () => {
  it('pays 12% on the first invoice', () => {
    expect(commissionFor({ amountCents: PREMIUM, partner: partner(), isFirstPayment: true }))
      .toEqual({ commissionCents: 72, commissionBps: 1200 });
  });

  it('pays 7% on every renewal', () => {
    expect(commissionFor({ amountCents: PREMIUM, partner: partner(), isFirstPayment: false }))
      .toEqual({ commissionCents: 42, commissionBps: 700 });
  });

  it('scales with the plan', () => {
    expect(
      commissionFor({ amountCents: SOUTIEN, partner: partner(), isFirstPayment: true })
        .commissionCents,
    ).toBe(120);
    expect(
      commissionFor({ amountCents: SOUTIEN, partner: partner(), isFirstPayment: false })
        .commissionCents,
    ).toBe(70);
  });

  it('pays more on the first invoice than on a renewal', () => {
    const first = commissionFor({ amountCents: PREMIUM, partner: partner(), isFirstPayment: true });
    const later = commissionFor({ amountCents: PREMIUM, partner: partner(), isFirstPayment: false });
    expect(first.commissionCents).toBeGreaterThan(later.commissionCents);
  });

  it('honours a negotiated rate rather than the default', () => {
    // Rates live on the partner so a big gym can be given better terms.
    const vip = partner({ rateFirstBps: 2000, rateRecurringBps: 1500 });
    expect(commissionFor({ amountCents: 1000, partner: vip, isFirstPayment: true }).commissionCents)
      .toBe(200);
    expect(commissionFor({ amountCents: 1000, partner: vip, isFirstPayment: false }).commissionCents)
      .toBe(150);
  });

  it('records the rate it applied, for auditing later', () => {
    // Rates can change; a payout made last year must stay explicable.
    expect(commissionFor({ amountCents: PREMIUM, partner: partner(), isFirstPayment: true })
      .commissionBps).toBe(1200);
    expect(commissionFor({ amountCents: PREMIUM, partner: partner(), isFirstPayment: false })
      .commissionBps).toBe(700);
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
      expect(Math.abs(commissionCents - (amount * 700) / 10_000)).toBeLessThanOrEqual(0.5);
    }
  });

  it('rounds a half cent up', () => {
    // 7% of 50 is exactly 3.5.
    expect(commissionFor({ amountCents: 50, partner: partner(), isFirstPayment: false })
      .commissionCents).toBe(4);
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
  it('starts partners on 12% and 7%', () => {
    expect(defaultRates()).toEqual({ rateFirstBps: 1200, rateRecurringBps: 700 });
  });

  it('reads rates back as percentages for display', () => {
    expect(bpsToPercent(RATE_FIRST_BPS)).toBe(12);
    expect(bpsToPercent(RATE_RECURRING_BPS)).toBe(7);
  });

  it('sets a payout minimum that is worth a bank transfer', () => {
    expect(PAYOUT_MINIMUM_CENTS).toBeGreaterThan(0);
    // Earning starts at the first referral; only the transfer waits.
    expect(commissionFor({ amountCents: PREMIUM, partner: partner(), isFirstPayment: true })
      .commissionCents).toBeGreaterThan(0);
  });
});
