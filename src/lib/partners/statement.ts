import type { PeriodId } from './period';

/**
 * What one partner is owed for one month.
 *
 * Pure, free of Firebase, for the same reason commission.ts is: this decides
 * how much real money leaves a bank account and has to be readable and
 * testable on its own.
 */

export interface LedgerLine {
  invoiceId: string;
  commissionCents: number;
  /** When the invoice was paid. */
  paidAt: Date;
  /** Null while the commission is still outstanding. */
  commissionPaidAt: Date | null;
}

export interface StatementTotals {
  /** Commission on invoices paid INSIDE the period. */
  periodCents: number;
  /** Unpaid commission from BEFORE the period — the carry-forward. */
  carriedCents: number;
  totalCents: number;
  invoiceCount: number;
  invoiceIds: string[];
  /** Owed, but not yet worth a bank transfer. Carried, never lost. */
  belowMinimum: boolean;
}

/**
 * Two buckets, and the split is the whole point.
 *
 *  - periodCents is what the partner recognises: it matches their own sense of
 *    what happened in March.
 *  - carriedCents exists because of the payout minimum. A partner owed 8 EUR in
 *    January is not paid in January, and that 8 EUR has to appear somewhere in
 *    February or it silently vanishes from the statement history — and a
 *    partner who notices that stops believing every other figure on the page.
 *
 * Only UNPAID lines count. A line already settled by an earlier statement is
 * excluded by its own commissionPaidAt stamp, which is why the ledger stays the
 * single source of truth and this function invents nothing. Two places holding
 * "what is owed" is how a reconciliation becomes impossible.
 */
export function statementFor(
  lines: readonly LedgerLine[],
  bounds: { start: Date; end: Date },
  minimumCents: number,
): StatementTotals {
  let periodCents = 0;
  let carriedCents = 0;
  const invoiceIds: string[] = [];

  for (const line of lines) {
    if (line.commissionPaidAt) continue; // Already transferred.
    if (line.paidAt >= bounds.end) continue; // The future is not owed yet.

    // Half-open [start, end): a payment at exactly 00:00 on the 1st belongs to
    // the month starting, not the month ending.
    if (line.paidAt >= bounds.start) periodCents += line.commissionCents;
    else carriedCents += line.commissionCents;

    invoiceIds.push(line.invoiceId);
  }

  const totalCents = periodCents + carriedCents;

  return {
    periodCents,
    carriedCents,
    totalCents,
    invoiceCount: invoiceIds.length,
    invoiceIds,
    // Not "owes nothing" — owed, and not yet worth a transfer. The wording on
    // the dashboard has to keep that distinction or a partner reads it as a
    // refusal to pay.
    belowMinimum: totalCents > 0 && totalCents < minimumCents,
  };
}

/** The deterministic statement id. Recomputing overwrites, never duplicates. */
export const statementId = (partnerId: string, period: PeriodId): string =>
  `${partnerId}_${period}`;
