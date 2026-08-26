import { NextResponse } from 'next/server';
import { adminDb, adminDenial, checkAdmin } from '@/lib/server/firebase-admin';

/**
 * Mark a partner's outstanding commission as transferred.
 *
 * The app never moves money — you make the bank transfer, then record it here.
 * Automatic payouts would mean Stripe Connect and every partner filing identity
 * documents, which is a project of its own.
 *
 * Stamps each unpaid payment individually rather than zeroing a balance: the
 * ledger stays the single source of truth, and any past payout can still be
 * explained line by line.
 */

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const check = await checkAdmin(req);
  if (!check.ok) return adminDenial(check);

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let partnerId: unknown;
  try {
    ({ partnerId } = (await req.json()) as { partnerId?: unknown });
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (typeof partnerId !== 'string' || !partnerId) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  try {
    // Capped below Firestore's 500-write batch limit. A partner with more
    // outstanding invoices than this gets paid across two clicks, which is
    // fine — silently truncating a batch would not be.
    const pending = await db
      .collection('payments')
      .where('partnerId', '==', partnerId)
      .where('commissionPaidAt', '==', null)
      .limit(450)
      .get();

    if (pending.empty) {
      return NextResponse.json({ marked: 0, totalCents: 0 });
    }

    const now = new Date();
    let totalCents = 0;

    // Batched so the whole payout lands or none of it does — a half-marked
    // payout would leave a partner owed money the dashboard says was paid.
    const batch = db.batch();
    for (const doc of pending.docs) {
      totalCents += (doc.get('commissionCents') as number) ?? 0;
      batch.update(doc.ref, { commissionPaidAt: now, paidBy: check.uid });
    }
    await batch.commit();

    return NextResponse.json({
      marked: pending.size,
      totalCents,
      // Tells the dashboard to offer the button again.
      more: pending.size === 450,
    });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
