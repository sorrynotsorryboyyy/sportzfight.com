import { NextResponse } from 'next/server';
import { adminDb, adminDenial, checkAdmin } from '@/lib/server/firebase-admin';
import {
  isPeriodId,
  periodBounds,
  periodOf,
  previousPeriod,
  type PeriodId,
} from '@/lib/partners/period';
import {
  statementFor,
  statementId,
  type LedgerLine,
} from '@/lib/partners/statement';
import { PAYOUT_MINIMUM_CENTS } from '@/lib/partners/types';

/**
 * Monthly statements, and recording the transfer that settles one.
 *
 * The app never moves money — you make the bank transfer, then record it here.
 * Automatic payouts would mean Stripe Connect and every partner filing identity
 * documents, which is a project of its own.
 *
 * A statement is a SNAPSHOT and a receipt, never an independent balance. What
 * is owed is, and stays, the sum of unpaid commissionCents in `payments`.
 * Keeping a second running total here would let the two drift, and the day they
 * disagree there is no way to know which is right.
 *
 * Statements are computed ON DEMAND rather than by a scheduled job. A cron
 * would be new infrastructure whose failure mode is a month silently never
 * generated; on demand is self-healing, because opening June after skipping
 * April recomputes April correctly from a ledger that never moved.
 */

export const runtime = 'nodejs';

/** Firestore commits at most 500 writes per batch. */
const MAX_LINES = 450;

/** Unpaid ledger lines for one partner, oldest first. */
async function unpaidLines(
  db: FirebaseFirestore.Firestore,
  partnerId: string,
): Promise<{ lines: LedgerLine[]; refs: FirebaseFirestore.DocumentReference[]; overflow: boolean }> {
  // Per-partner and unpaid-only, served by the existing
  // (partnerId, commissionPaidAt) index. As payouts happen the unpaid set
  // stays small however large the ledger grows.
  const snap = await db
    .collection('payments')
    .where('partnerId', '==', partnerId)
    .where('commissionPaidAt', '==', null)
    .limit(MAX_LINES + 1)
    .get();

  const overflow = snap.size > MAX_LINES;
  const docs = overflow ? snap.docs.slice(0, MAX_LINES) : snap.docs;

  return {
    overflow,
    refs: docs.map((d) => d.ref),
    lines: docs.map((d) => ({
      invoiceId: (d.get('invoiceId') as string) ?? d.id,
      commissionCents: (d.get('commissionCents') as number) ?? 0,
      paidAt: (d.get('paidAt') as FirebaseFirestore.Timestamp | null)?.toDate?.() ?? new Date(0),
      commissionPaidAt: null,
    })),
  };
}

/**
 * GET — the drafts for a period, plus any statement already settled for it.
 *
 * Defaults to the PREVIOUS month: you settle March in early April, not
 * mid-March.
 */
export async function GET(req: Request) {
  const check = await checkAdmin(req);
  if (!check.ok) return adminDenial(check);

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const asked = new URL(req.url).searchParams.get('period');
  const period: PeriodId = isPeriodId(asked)
    ? asked
    : previousPeriod(periodOf(new Date()));
  const bounds = periodBounds(period);

  try {
    const partners = await db.collection('partners').get();
    const rows = [];

    for (const p of partners.docs) {
      const id = p.id;
      const settled = await db.doc(`payouts/${statementId(id, period)}`).get();

      // A PAID statement is frozen. Recomputing it would change a number that
      // has already left a bank account.
      if (settled.exists && settled.get('status') === 'paid') {
        rows.push({ ...settled.data(), id, frozen: true });
        continue;
      }

      const { lines, overflow } = await unpaidLines(db, id);
      const totals = statementFor(lines, bounds, PAYOUT_MINIMUM_CENTS);
      if (totals.totalCents === 0 && !overflow) continue;

      rows.push({
        id,
        partnerId: id,
        partnerCode: p.get('code') as string,
        partnerName: p.get('name') as string,
        period,
        ...totals,
        status: 'draft' as const,
        overflow,
        frozen: false,
      });
    }

    return NextResponse.json({ period, rows });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

/**
 * POST — record that a statement has been transferred.
 *
 * Stamps every ledger line AND writes the statement in ONE commit. A statement
 * marked paid whose lines were still unpaid would be offered again next month,
 * which is a duplicate bank transfer.
 */
export async function POST(req: Request) {
  const check = await checkAdmin(req);
  if (!check.ok) return adminDenial(check);

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let body: { partnerId?: unknown; period?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const partnerId = body.partnerId;
  if (typeof partnerId !== 'string' || !partnerId) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const period: PeriodId = isPeriodId(body.period)
    ? body.period
    : previousPeriod(periodOf(new Date()));

  try {
    const ref = db.doc(`payouts/${statementId(partnerId, period)}`);

    // Guard one: already settled. Returning the existing statement rather than
    // an error, because the admin double-clicked and that is not a failure.
    const existing = await ref.get();
    if (existing.exists && existing.get('status') === 'paid') {
      return NextResponse.json({ alreadyPaid: true, statement: existing.data() });
    }

    const partner = await db.doc(`partners/${partnerId}`).get();
    if (!partner.exists) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const { lines, refs, overflow } = await unpaidLines(db, partnerId);

    if (overflow) {
      // No statement at all rather than a truncated one. A document claiming
      // to cover 450 of 600 invoices is worse than no document: it would be
      // invoiced against, and the missing 150 would look like they were paid.
      return NextResponse.json({ error: 'too_many', more: true }, { status: 409 });
    }

    // Recomputed server-side. The amount is never taken from the request.
    const bounds = periodBounds(period);
    const totals = statementFor(lines, bounds, PAYOUT_MINIMUM_CENTS);

    if (totals.totalCents === 0) {
      // Guard two, and it is structural: once the lines carry a
      // commissionPaidAt there is nothing left to settle, so a second call
      // cannot transfer anything even if guard one were removed.
      return NextResponse.json({ marked: 0, totalCents: 0 });
    }

    const now = new Date();
    const id = statementId(partnerId, period);
    const batch = db.batch();

    for (const lineRef of refs) {
      batch.update(lineRef, {
        commissionPaidAt: now,
        paidBy: check.uid,
        statementId: id,
      });
    }

    batch.set(ref, {
      partnerId,
      // Denormalised so an old statement stays readable after a rename.
      partnerCode: partner.get('code') ?? null,
      partnerName: partner.get('name') ?? null,
      period,
      periodCents: totals.periodCents,
      carriedCents: totals.carriedCents,
      totalCents: totals.totalCents,
      invoiceCount: totals.invoiceCount,
      invoiceIds: totals.invoiceIds,
      belowMinimum: totals.belowMinimum,
      status: 'paid',
      computedAt: now,
      paidAt: now,
      paidBy: check.uid,
    });

    await batch.commit();

    return NextResponse.json({
      marked: totals.invoiceCount,
      totalCents: totals.totalCents,
      period,
    });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
