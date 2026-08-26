import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminDenial, checkAdmin } from '@/lib/server/firebase-admin';
import { defaultRates, isValidCode, normaliseCode } from '@/lib/partners/commission';

/**
 * Review professional applications.
 *
 * Approving is what actually creates the partner and its code. The application
 * itself grants nothing — that separation is the whole point: the partner list
 * stays curated, which is the cheapest fraud control available when real money
 * is paid out.
 */

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const check = await checkAdmin(req);
  if (!check.ok) return adminDenial(check);

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  try {
    const snap = await db
      .collection('partnerApplications')
      .where('status', '==', 'pending')
      .get();

    // The applicant's username, so the admin knows who they are approving.
    const rows = await Promise.all(
      snap.docs.map(async (d) => {
        const user = await db.doc(`users/${d.id}`).get();
        return {
          uid: d.id,
          kind: d.get('kind'),
          structure: d.get('structure'),
          city: d.get('city') ?? '',
          discipline: d.get('discipline') ?? '',
          username: (user.get('username') as string | undefined) ?? '—',
        };
      }),
    );

    return NextResponse.json({ applications: rows });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

/** Approve (creating the partner) or reject. */
export async function POST(req: Request) {
  const check = await checkAdmin(req);
  if (!check.ok) return adminDenial(check);

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const uid = typeof body.uid === 'string' ? body.uid : '';
  const approve = body.approve === true;
  if (!uid) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const appRef = db.doc(`partnerApplications/${uid}`);

  try {
    const app = await appRef.get();
    if (!app.exists) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    if (!approve) {
      // Kept rather than deleted, so a resubmission is visibly a second try.
      await appRef.set(
        { status: 'rejected', reviewedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      return NextResponse.json({ ok: true, approved: false });
    }

    const code = typeof body.code === 'string' ? normaliseCode(body.code) : '';
    if (!isValidCode(code)) {
      return NextResponse.json({ error: 'bad_code' }, { status: 400 });
    }

    // Codes must be unique or every commission becomes ambiguous.
    const clash = await db
      .collection('partners')
      .where('code', '==', code)
      .limit(1)
      .get();
    if (!clash.empty) {
      return NextResponse.json({ error: 'code_taken' }, { status: 409 });
    }

    const rates = defaultRates();
    const partner = await db.collection('partners').add({
      code,
      name: app.get('structure'),
      kind: app.get('kind') === 'gym' ? 'gym' : 'coach',
      // Linked immediately, so /partenaire works the moment they refresh.
      ownerUid: uid,
      ...rates,
      city: app.get('city') || null,
      blurb: app.get('discipline') || null,
      logoUrl: null,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    await appRef.set(
      {
        status: 'approved',
        partnerId: partner.id,
        reviewedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, approved: true, partnerId: partner.id, code });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
