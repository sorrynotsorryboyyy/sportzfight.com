import { NextResponse } from 'next/server';
import { adminDb, bearer, uidFromToken } from '@/lib/server/firebase-admin';
import {
  periodBounds,
  periodOf,
  previousPeriod,
  type PeriodId,
} from '@/lib/partners/period';
import { statementFor, type LedgerLine } from '@/lib/partners/statement';
import { PAYOUT_MINIMUM_CENTS } from '@/lib/partners/types';

/**
 * A partner's own statement history.
 *
 * Exists because "have I been paid for March?" had no answer anywhere in the
 * app: the dashboard held one lifetime total and no dates, so the question came
 * back by email every month.
 *
 * Same privacy rule as /api/partner/stats — the partner document is found FROM
 * the caller's verified uid, never from a parameter, and nothing here names an
 * individual subscriber.
 */

export const runtime = 'nodejs';

/** Enough history to answer a question, not enough to page. */
const MAX_STATEMENTS = 24;

export async function GET(req: Request) {
  const uid = await uidFromToken(bearer(req));
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  try {
    const owned = await db
      .collection('partners')
      .where('ownerUid', '==', uid)
      .limit(1)
      .get();

    if (owned.empty) return NextResponse.json({ statements: [] });

    const partnerId = owned.docs[0].id;

    const paid = await db
      .collection('payouts')
      .where('partnerId', '==', partnerId)
      .orderBy('period', 'desc')
      .limit(MAX_STATEMENTS)
      .get();

    const statements = paid.docs.map((d) => ({
      period: d.get('period') as PeriodId,
      totalCents: (d.get('totalCents') as number) ?? 0,
      invoiceCount: (d.get('invoiceCount') as number) ?? 0,
      status: (d.get('status') as string) ?? 'paid',
      paidAt:
        (d.get('paidAt') as FirebaseFirestore.Timestamp | null)?.toDate?.()?.toISOString() ??
        null,
    }));

    // The month being accumulated is not a statement yet, but a partner asking
    // "what am I owed right now" is asking about it. Computed the same way the
    // admin view computes a draft, so the two agree.
    const current = previousPeriod(periodOf(new Date()));
    const alreadySettled = statements.some((s) => s.period === current);

    let draft = null;
    if (!alreadySettled) {
      const unpaid = await db
        .collection('payments')
        .where('partnerId', '==', partnerId)
        .where('commissionPaidAt', '==', null)
        .limit(451)
        .get();

      const lines: LedgerLine[] = unpaid.docs.map((d) => ({
        invoiceId: (d.get('invoiceId') as string) ?? d.id,
        commissionCents: (d.get('commissionCents') as number) ?? 0,
        paidAt:
          (d.get('paidAt') as FirebaseFirestore.Timestamp | null)?.toDate?.() ?? new Date(0),
        commissionPaidAt: null,
      }));

      const totals = statementFor(lines, periodBounds(current), PAYOUT_MINIMUM_CENTS);
      if (totals.totalCents > 0) {
        draft = {
          period: current,
          totalCents: totals.totalCents,
          invoiceCount: totals.invoiceCount,
          belowMinimum: totals.belowMinimum,
          status: 'draft' as const,
          paidAt: null,
        };
      }
    }

    return NextResponse.json({
      statements,
      draft,
      payoutMinimumCents: PAYOUT_MINIMUM_CENTS,
    });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
