import { NextResponse } from 'next/server';
import { adminDb, adminDenial, checkAdmin } from '@/lib/server/firebase-admin';
import { defaultRates } from '@/lib/partners/commission';
import { backfillCodeLocks } from '@/lib/server/partners';
import {
  LEGACY_RATE_FIRST_BPS,
  LEGACY_RATE_RECURRING_BPS,
} from '@/lib/partners/types';

/**
 * Move partners onto the current default commission rate.
 *
 * Rates live on each partner document so a big gym can be given better terms.
 * The flip side is that changing RATE_FIRST_BPS does NOTHING for anyone already
 * created: the programme would advertise 25% on /partenaires while every live
 * partner silently stayed on 12%/7%, and the first person to notice would be a
 * partner reading their own dashboard. This is the catch-up.
 *
 * Only partners still sitting on the OLD DEFAULT are moved. A negotiated rate
 * is a deliberate commercial decision and must survive a migration — quietly
 * overwriting one would break a signed agreement. Those are reported back so
 * the admin decides about them by hand.
 *
 * Idempotent: a partner already on the default is skipped, so pressing the
 * button twice is a no-op rather than a second migration.
 */

export const runtime = 'nodejs';

/** Firestore commits at most 500 writes per batch. */
const MAX_BATCH = 450;

export async function POST(req: Request) {
  const check = await checkAdmin(req);
  if (!check.ok) return adminDenial(check);

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const { rateFirstBps, rateRecurringBps } = defaultRates();

  try {
    const all = await db.collection('partners').get();

    if (all.size > MAX_BATCH) {
      // Refuse rather than truncate. A half-migrated partner list is worse
      // than an unmigrated one, because nobody can tell which half.
      return NextResponse.json({ error: 'too_many' }, { status: 400 });
    }

    const batch = db.batch();
    let moved = 0;
    const negotiated: string[] = [];

    for (const doc of all.docs) {
      const first = doc.get('rateFirstBps') as number | undefined;
      const recurring = doc.get('rateRecurringBps') as number | undefined;

      if (first === rateFirstBps && recurring === rateRecurringBps) continue;

      const onOldDefault =
        first === LEGACY_RATE_FIRST_BPS && recurring === LEGACY_RATE_RECURRING_BPS;

      if (onOldDefault) {
        batch.update(doc.ref, { rateFirstBps, rateRecurringBps });
        moved += 1;
      } else {
        negotiated.push((doc.get('code') as string) ?? doc.id);
      }
    }

    if (moved > 0) await batch.commit();

    // Same button claims the code locks for partners that predate them.
    // Folded in here rather than given its own control because both are
    // one-shot catch-ups for partners created before a change, and a second
    // button nobody knows to press is a lock nobody has.
    const { locked, conflicts } = await backfillCodeLocks(db);

    return NextResponse.json({ moved, negotiated, locked, conflicts });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
