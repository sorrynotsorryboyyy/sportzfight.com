import { NextResponse } from 'next/server';
import { adminDb, bearer, uidFromToken } from '@/lib/server/firebase-admin';
import { PAYOUT_MINIMUM_CENTS } from '@/lib/partners/types';
import { periodBounds, periodOf } from '@/lib/partners/period';

/**
 * What a partner sees about their own performance.
 *
 * AGGREGATES ONLY — counts and amounts, never a username, an email or an
 * individual signup date. Telling a gym which named people subscribed would
 * disclose someone's identity and paid status to a third party, which under
 * the GDPR needs their explicit consent and is not necessary for the
 * programme to work.
 *
 * A partner may only ever read their own figures: the partner document is
 * found FROM the caller's verified uid, never from a parameter.
 */

export const runtime = 'nodejs';

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

    if (owned.empty) {
      // Not a partner. Not an error — /partenaire renders an explanation.
      return NextResponse.json({ partner: null });
    }

    const doc = owned.docs[0];

    // Paris, not the server clock. This used to be setDate(1)/setHours(0),
    // which on a UTC box puts the boundary at 01:00 or 02:00 French time, so a
    // payment made just after midnight on the 1st counted towards the previous
    // month. Harmless on a live counter, not harmless once the same boundary
    // decides which statement a line lands on.
    const monthStart = periodBounds(periodOf(new Date())).start;

    const [referrals, payments] = await Promise.all([
      db.collection('users').where('partnerId', '==', doc.id).count().get(),
      db.collection('payments').where('partnerId', '==', doc.id).get(),
    ]);

    let monthCents = 0;
    let pendingCents = 0;
    let paidCents = 0;
    const subscribers = new Set<string>();

    for (const p of payments.docs) {
      const cents = (p.get('commissionCents') as number) ?? 0;
      const paidAt = p.get('paidAt') as { toDate?: () => Date } | undefined;
      const when = paidAt?.toDate?.();

      if (when && when >= monthStart) monthCents += cents;
      if (p.get('commissionPaidAt')) paidCents += cents;
      else pendingCents += cents;

      // A count of distinct payers, not who they are.
      const payer = p.get('uid') as string | undefined;
      if (payer) subscribers.add(payer);
    }

    return NextResponse.json({
      partner: {
        code: doc.get('code'),
        name: doc.get('name'),
        active: doc.get('active') === true,
        rateFirstBps: doc.get('rateFirstBps'),
        rateRecurringBps: doc.get('rateRecurringBps'),
        referrals: referrals.data().count,
        subscribers: subscribers.size,
        monthCents,
        pendingCents,
        paidCents,
        payoutMinimumCents: PAYOUT_MINIMUM_CENTS,
      },
    });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
