import { NextResponse } from 'next/server';
import { adminDb, bearer, uidFromToken } from '@/lib/server/firebase-admin';
import { PAYOUT_MINIMUM_CENTS } from '@/lib/partners/types';

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

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

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
