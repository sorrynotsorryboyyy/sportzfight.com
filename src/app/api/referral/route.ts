import { NextResponse } from 'next/server';
import { adminDb, bearer, uidFromToken } from '@/lib/server/firebase-admin';
import { normaliseCode } from '@/lib/partners/commission';

/**
 * Record who referred this account.
 *
 * Why a server route at all: the signup rule is
 * `hasOnly(['username','avatar','createdAt'])`, so a client physically cannot
 * write this — and it should not be able to, since the field decides who gets
 * paid.
 *
 * Written ONCE. A player who could re-attribute themselves could move a
 * commission to a friend's code the day before renewing.
 */

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const uid = await uidFromToken(bearer(req));
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let raw: unknown;
  try {
    ({ code: raw } = (await req.json()) as { code?: unknown });
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const code = typeof raw === 'string' ? normaliseCode(raw) : '';
  if (!code) return NextResponse.json({ error: 'bad_code' }, { status: 400 });

  try {
    const userRef = db.doc(`users/${uid}`);
    const snap = await userRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'no_profile' }, { status: 404 });
    }

    // Already attributed: succeed quietly rather than error. The client fires
    // this on every load while a cookie is present, and a second call is not a
    // failure — it just must not change anything.
    if (snap.get('partnerId')) {
      return NextResponse.json({ attributed: false, reason: 'already' });
    }

    const found = await db
      .collection('partners')
      .where('code', '==', code)
      .limit(1)
      .get();

    if (found.empty) {
      return NextResponse.json({ attributed: false, reason: 'unknown_code' });
    }

    const partner = found.docs[0];
    if (partner.get('active') !== true) {
      return NextResponse.json({ attributed: false, reason: 'inactive' });
    }

    await userRef.set(
      { partnerId: partner.id, referredBy: code, referredAt: new Date() },
      { merge: true },
    );

    return NextResponse.json({ attributed: true });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
