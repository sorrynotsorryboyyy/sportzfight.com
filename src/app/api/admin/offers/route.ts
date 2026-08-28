import { NextResponse } from 'next/server';
import { adminDb, adminDenial, checkAdmin } from '@/lib/server/firebase-admin';
import { OFFER_DETAILS_MAX } from '@/lib/partners/types';

/**
 * The review queue for partner offers.
 *
 * /p/CODE is a page SportzFight publishes, so a claim on it is made in our
 * name — "the gym promised you a bottle" and "SportzFight promised you a
 * bottle" are different sentences, and only one of them is a consumer-law
 * problem. Hence review before publication.
 *
 * Listed with a COLLECTION GROUP query across every partner's offers. That
 * works here because the Admin SDK bypasses rules entirely; a client-side
 * collection-group query would be evaluated against a group-scoped rule that
 * does not exist and would be denied. Do not add one.
 */

export const runtime = 'nodejs';

const MAX_QUEUE = 100;

export async function GET(req: Request) {
  const check = await checkAdmin(req);
  if (!check.ok) return adminDenial(check);

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  try {
    const pending = await db
      .collectionGroup('offers')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
      .limit(MAX_QUEUE)
      .get();

    // The partner's name, so the admin knows whose claim they are reading.
    // One read per distinct partner, cached across the queue.
    const names = new Map<string, string>();
    const rows = [];

    for (const d of pending.docs) {
      const partnerRef = d.ref.parent.parent;
      if (!partnerRef) continue;

      if (!names.has(partnerRef.id)) {
        const p = await partnerRef.get();
        names.set(partnerRef.id, (p.get('name') as string) ?? partnerRef.id);
      }

      rows.push({
        id: d.id,
        partnerId: partnerRef.id,
        partnerName: names.get(partnerRef.id) ?? '',
        label: d.get('label') as string,
        details: (d.get('details') as string | null) ?? null,
      });
    }

    return NextResponse.json({ offers: rows, pending: pending.size });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

/** Approve or refuse one. A refusal carries a reason the partner will read. */
export async function PATCH(req: Request) {
  const check = await checkAdmin(req);
  if (!check.ok) return adminDenial(check);

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let body: { partnerId?: unknown; id?: unknown; approve?: unknown; note?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { partnerId, id } = body;
  if (typeof partnerId !== 'string' || typeof id !== 'string' || !partnerId || !id) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const approve = body.approve === true;
  const note =
    typeof body.note === 'string' && body.note.trim()
      ? body.note.trim().slice(0, OFFER_DETAILS_MAX)
      : null;

  try {
    await db
      .collection('partners')
      .doc(partnerId)
      .collection('offers')
      .doc(id)
      .update({
        status: approve ? 'approved' : 'rejected',
        // Cleared on approval: a stale refusal reason next to a live offer
        // would read as a warning about the offer itself.
        reviewNote: approve ? null : note,
        updatedAt: new Date(),
      });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
