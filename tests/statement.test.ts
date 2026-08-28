import { describe, expect, it } from 'vitest';
import {
  isPeriodId,
  nextPeriod,
  periodBounds,
  periodLabel,
  periodOf,
  periodRangeLabel,
  previousPeriod,
} from '../src/lib/partners/period';
import {
  statementFor,
  statementId,
  type LedgerLine,
} from '../src/lib/partners/statement';
import { PAYOUT_MINIMUM_CENTS } from '../src/lib/partners/types';

/**
 * A statement is the basis for a partner's invoice and for a bank transfer, so
 * these tests lean towards paying LESS and towards leaving money visible rather
 * than making it disappear quietly.
 */

const line = (over: Partial<LedgerLine> = {}): LedgerLine => ({
  invoiceId: 'in_1',
  commissionCents: 150,
  paidAt: new Date('2026-03-15T12:00:00Z'),
  commissionPaidAt: null,
  ...over,
});

describe('periods are Paris calendar months', () => {
  it('names the month an instant falls in', () => {
    expect(periodOf(new Date('2026-03-15T12:00:00Z'))).toBe('2026-03');
  });

  it('puts a late-evening Paris instant in the right month', () => {
    /**
     * THE bug this module exists to remove.
     *
     * 2026-02-28T23:30:00Z is already 1 March, 00:30, in Paris. Server-local
     * arithmetic on a UTC box calls that February, so a payment a partner made
     * in March would appear on their February statement — and February would
     * already have been sent.
     */
    expect(periodOf(new Date('2026-02-28T23:30:00Z'))).toBe('2026-03');
  });

  it('starts a month at midnight Paris, not midnight UTC', () => {
    // March is winter time, UTC+1: Paris midnight is 23:00 the day before.
    expect(periodBounds('2026-03').start.toISOString()).toBe(
      '2026-02-28T23:00:00.000Z',
    );
  });

  it('handles the summer offset too', () => {
    // July is UTC+2, so Paris midnight is 22:00 the day before. A single
    // hardcoded offset would get exactly one of these two tests right.
    expect(periodBounds('2026-07').start.toISOString()).toBe(
      '2026-06-30T22:00:00.000Z',
    );
  });

  it('spans a month that contains a DST transition', () => {
    // France springs forward on the last Sunday of March. The month still runs
    // from one Paris midnight to the next, whatever happens in between.
    const march = periodBounds('2026-03');
    expect(march.start.toISOString()).toBe('2026-02-28T23:00:00.000Z');
    expect(march.end.toISOString()).toBe('2026-03-31T22:00:00.000Z');
  });

  it('rolls over the year', () => {
    expect(periodBounds('2026-12').end.toISOString()).toBe(
      '2026-12-31T23:00:00.000Z',
    );
    expect(previousPeriod('2026-01')).toBe('2025-12');
    expect(nextPeriod('2026-12')).toBe('2027-01');
  });

  it('rejects anything that is not a period', () => {
    for (const bad of ['2026-13', '2026-00', '202603', '', 'mars', null, 7]) {
      expect(isPeriodId(bad)).toBe(false);
    }
    expect(isPeriodId('2026-01')).toBe(true);
  });

  it('labels a period in French', () => {
    expect(periodLabel('2026-03')).toBe('mars 2026');
    expect(periodLabel('2026-08')).toBe('août 2026');
  });

  it('spells out the range an invoice needs', () => {
    expect(periodRangeLabel('2026-03')).toBe('du 1er au 31 mars 2026');
    expect(periodRangeLabel('2026-04')).toBe('du 1er au 30 avril 2026');
    // Leap year, derived rather than tabulated.
    expect(periodRangeLabel('2028-02')).toBe('du 1er au 29 février 2028');
    expect(periodRangeLabel('2026-02')).toBe('du 1er au 28 février 2026');
  });
});

describe('what a partner is owed for a month', () => {
  const march = periodBounds('2026-03');

  it('sums the commission on invoices paid in the month', () => {
    const s = statementFor(
      [
        line({ invoiceId: 'a' }),
        line({ invoiceId: 'b', paidAt: new Date('2026-03-20T09:00:00Z') }),
      ],
      march,
      PAYOUT_MINIMUM_CENTS,
    );
    expect(s.periodCents).toBe(300);
    expect(s.carriedCents).toBe(0);
    expect(s.invoiceCount).toBe(2);
  });

  it('puts a payment at exactly midnight on the 1st in the month STARTING', () => {
    // Half-open [start, end). Getting this backwards moves a line between two
    // statements that have both already been sent to a partner.
    const s = statementFor(
      [line({ paidAt: march.start })],
      march,
      PAYOUT_MINIMUM_CENTS,
    );
    expect(s.periodCents).toBe(150);
    expect(s.carriedCents).toBe(0);
  });

  it('puts a payment at the closing instant in the NEXT month', () => {
    const s = statementFor([line({ paidAt: march.end })], march, PAYOUT_MINIMUM_CENTS);
    expect(s.totalCents).toBe(0);
    expect(s.invoiceCount).toBe(0);
  });

  it('carries an older unpaid balance forward', () => {
    /**
     * Why this exists: a partner owed 8 EUR in January is not transferred in
     * January because of the minimum. That 8 EUR has to reappear in February or
     * it silently vanishes from the history — and a partner who spots money
     * disappearing stops trusting every other number on the page.
     */
    const s = statementFor(
      [
        line({ invoiceId: 'old', paidAt: new Date('2026-01-10T10:00:00Z') }),
        line({ invoiceId: 'new' }),
      ],
      march,
      PAYOUT_MINIMUM_CENTS,
    );
    expect(s.carriedCents).toBe(150);
    expect(s.periodCents).toBe(150);
    expect(s.totalCents).toBe(300);
    // Both are settled by this transfer, so both are on the statement.
    expect(s.invoiceIds).toEqual(['old', 'new']);
  });

  it('ignores commission already transferred', () => {
    // The ledger stamp is the source of truth. A line settled by an earlier
    // statement must never be offered for payment twice.
    const s = statementFor(
      [line({ commissionPaidAt: new Date('2026-02-05T10:00:00Z') })],
      march,
      PAYOUT_MINIMUM_CENTS,
    );
    expect(s.totalCents).toBe(0);
    expect(s.invoiceIds).toEqual([]);
  });

  it('flags a balance below the minimum without hiding it', () => {
    const s = statementFor(
      [line({ commissionCents: 430 })],
      march,
      PAYOUT_MINIMUM_CENTS,
    );
    expect(s.belowMinimum).toBe(true);
    // Still owed, still visible. "Below the minimum" is not "owes nothing".
    expect(s.totalCents).toBe(430);
  });

  it('does not flag an empty statement as below the minimum', () => {
    // Zero is not a small balance waiting for a transfer — it is nothing owed,
    // and telling a partner it is "reporté" would be a lie.
    const s = statementFor([], march, PAYOUT_MINIMUM_CENTS);
    expect(s.belowMinimum).toBe(false);
    expect(s.totalCents).toBe(0);
  });

  it('clears the flag once the balance is worth transferring', () => {
    const s = statementFor(
      [line({ commissionCents: PAYOUT_MINIMUM_CENTS })],
      march,
      PAYOUT_MINIMUM_CENTS,
    );
    expect(s.belowMinimum).toBe(false);
  });

  it('never invents money', () => {
    // The total is exactly the sum of the lines it names, always.
    const lines = [
      line({ invoiceId: 'a', commissionCents: 150 }),
      line({ invoiceId: 'b', commissionCents: 250, paidAt: new Date('2026-01-02T00:00:00Z') }),
      line({ invoiceId: 'c', commissionCents: 999, commissionPaidAt: new Date() }),
    ];
    const s = statementFor(lines, march, PAYOUT_MINIMUM_CENTS);
    const named = lines
      .filter((l) => s.invoiceIds.includes(l.invoiceId))
      .reduce((sum, l) => sum + l.commissionCents, 0);
    expect(s.totalCents).toBe(named);
    expect(s.periodCents + s.carriedCents).toBe(s.totalCents);
  });
});

describe('statement identity', () => {
  it('is deterministic, so recomputing overwrites rather than duplicates', () => {
    // A duplicated statement is a duplicated bank transfer.
    expect(statementId('abc', '2026-03')).toBe('abc_2026-03');
    expect(statementId('abc', '2026-03')).toBe(statementId('abc', '2026-03'));
  });

  it('separates partners and months', () => {
    expect(statementId('abc', '2026-03')).not.toBe(statementId('abd', '2026-03'));
    expect(statementId('abc', '2026-03')).not.toBe(statementId('abc', '2026-04'));
  });
});
