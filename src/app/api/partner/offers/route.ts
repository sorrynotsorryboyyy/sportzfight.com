import { NextResponse } from 'next/server';
import { adminDb, bearer, uidFromToken } from '@/lib/server/firebase-admin';
import {
  OFFERS_MAX,
  OFFER_DETAILS_MAX,
  OFFER_LABEL_MAX,
} from '@/lib/partners/types';

/**
 * A partner's own offers: what they give a subscriber, in person.
 *
 * Goes through a route rather than letting the client write Firestore directly
 * so the per-partner cap has somewhere to live — counting sibling documents is
 * not expressible in security rules. The rules remain the boundary for
 * everything they CAN express, and for the case this route does not cover: a
 * modified client writing straight to the database.
 *
 * The partner is found FROM the verified uid, never from a parameter, so one
 * partner can never touch another's offers.
 */

export const runtime = 'nodejs';

interface OfferBody {
  id?: unknown;
  label?: unknown;
  details?: unknown;
}

async function ownedPartnerId(
  db: FirebaseFirestore.Firestore,
  uid: string,
): Promise<string | null> {
  const owned = await db
    .collection('partners')
    .where('ownerUid', '==', uid)
    .limit(1)
    .get();
  return owned.empty ? null : owned.docs[0].id;
}

/** Everything the partner has written, whatever its review status. */
export async function GET(req: Request) {
  const uid = await uidFromToken(bearer(req));
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  try {
    const partnerId = await ownedPartnerId(db, uid);
    if (!partnerId) return NextResponse.json({ offers: [] });

    const snap = await db
      .collection('partners')
      .doc(partnerId)
      .collection('offers')
      .orderBy('createdAt', 'asc')
      .get();

    return NextResponse.json({
      offers: snap.docs.map((d) => ({
        id: d.id,
        label: d.get('label') as string,
        details: (d.get('details') as string | null) ?? null,
        status: (d.get('status') as string) ?? 'pending',
        reviewNote: (d.get('reviewNote') as string | null) ?? null,
      })),
      max: OFFERS_MAX,
    });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

/** Create one, or edit one — an edit always returns it to review. */
export async function POST(req: Request) {
  const uid = await uidFromToken(bearer(req));
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let body: OfferBody;
  try {
    body = (await req.json()) as OfferBody;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const label = typeof body.label === 'string' ? body.label.trim() : '';
  const details =
    typeof body.details === 'string' && body.details.trim()
      ? body.details.trim()
      : null;

  if (!label || label.length > OFFER_LABEL_MAX) {
    return NextResponse.json({ error: 'bad_label' }, { status: 400 });
  }
  if (details && details.length > OFFER_DETAILS_MAX) {
    return NextResponse.json({ error: 'bad_details' }, { status: 400 });
  }

  try {
    const partnerId = await ownedPartnerId(db, uid);
    if (!partnerId) return NextResponse.json({ error: 'not_partner' }, { status: 403 });

    const offers = db.collection('partners').doc(partnerId).collection('offers');
    const now = new Date();
    const editing = typeof body.id === 'string' && body.id ? body.id : null;

    if (!editing) {
      // The cap rules cannot express. Bypassing it produces a pile of pending
      // offers no admin will approve, so nothing reaches /p/CODE — bounded,
      // and not financial.
      const count = await offers.count().get();
      if (count.data().count >= OFFERS_MAX) {
        return NextResponse.json({ error: 'too_many', max: OFFERS_MAX }, { status: 409 });
      }

      const ref = await offers.add({
        label,
        details,
        status: 'pending',
        authorUid: uid,
        createdAt: now,
        updatedAt: now,
        reviewNote: null,
      });
      return NextResponse.json({ id: ref.id, status: 'pending' });
    }

    const ref = offers.doc(editing);
    if (!(await ref.get()).exists) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // Back to pending, always. An approved offer edited in place would mean
    // the review reviewed text nobody sees any more.
    await ref.update({
      label,
      details,
      status: 'pending',
      updatedAt: now,
      reviewNote: null,
    });
    return NextResponse.json({ id: editing, status: 'pending' });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

/** Withdraw one. */
export async function DELETE(req: Request) {
  const uid = await uidFromToken(bearer(req));
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  try {
    const partnerId = await ownedPartnerId(db, uid);
    if (!partnerId) return NextResponse.json({ error: 'not_partner' }, { status: 403 });

    await db
      .collection('partners')
      .doc(partnerId)
      .collection('offers')
      .doc(id)
      .delete();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
