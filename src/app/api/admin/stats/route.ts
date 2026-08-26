import { NextResponse } from 'next/server';
import { adminDb, adminDenial, checkAdmin } from '@/lib/server/firebase-admin';

/**
 * Dashboard totals.
 *
 * Computed SERVER-SIDE. Scanning `users` from the browser would ship every
 * profile to the client and stop scaling the moment the game has real players.
 *
 * Counts use Firestore's aggregation queries, billed at roughly one read per
 * thousand documents rather than one per document.
 */

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const check = await checkAdmin(req);
  if (!check.ok) return adminDenial(check);

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [users, battles, finished, payments] = await Promise.all([
      db.collection('users').count().get(),
      db.collection('battles').count().get(),
      db.collection('battles').where('status', '==', 'finished').count().get(),
      // The ledger is small (one document per invoice) and every figure below
      // needs the amounts, so it is read rather than counted.
      db.collection('payments').get(),
    ]);

    let revenueCents = 0;
    let monthRevenueCents = 0;
    let commissionOwedCents = 0;
    let commissionPaidCents = 0;
    const payingSubs = new Set<string>();

    for (const doc of payments.docs) {
      const amount = (doc.get('amountCents') as number) ?? 0;
      const commission = (doc.get('commissionCents') as number) ?? 0;
      const paidAt = doc.get('paidAt') as { toDate?: () => Date } | undefined;
      const when = paidAt?.toDate?.();

      revenueCents += amount;
      if (when && when >= monthStart) monthRevenueCents += amount;

      if (doc.get('commissionPaidAt')) commissionPaidCents += commission;
      else commissionOwedCents += commission;

      const uid = doc.get('uid') as string | undefined;
      if (uid) payingSubs.add(uid);
    }

    const partners = await db.collection('partners').count().get();

    return NextResponse.json({
      players: users.data().count,
      battles: battles.data().count,
      battlesFinished: finished.data().count,
      partners: partners.data().count,
      customers: payingSubs.size,
      revenueCents,
      monthRevenueCents,
      commissionOwedCents,
      commissionPaidCents,
    });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
