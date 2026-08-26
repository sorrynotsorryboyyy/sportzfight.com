import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, bearer, uidFromToken } from '@/lib/server/firebase-admin';
import {
  sanitiseApplication,
  sanitisePrivate,
  sanitisePublic,
} from '@/lib/profile/onboarding';

/**
 * Finish the welcome screen.
 *
 * Writes across two documents and sometimes a third, in one batch:
 *   users/{uid}                       public answers + onboardedAt
 *   users/{uid}/private/profile       age, height, weight, gender, city
 *   partnerApplications/{uid}         only when applying as a professional
 *
 * The split is not decoration. users/{uid} is listable by every signed-in
 * account — that is what makes the leaderboard work — so personal details on
 * it would be harvestable in one query.
 *
 * Declaring yourself a pro grants NOTHING: it files an application an admin
 * reviews. The rules cap client-written accountType at 'player' for the same
 * reason.
 */

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const uid = await uidFromToken(bearer(req));
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const pub = sanitisePublic(body);
  const priv = sanitisePrivate(body);
  const application =
    pub.accountType === 'pro' ? sanitiseApplication(body.application) : null;

  try {
    const userRef = db.doc(`users/${uid}`);
    const snap = await userRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'no_profile' }, { status: 404 });
    }

    const batch = db.batch();

    batch.set(
      userRef,
      {
        accountType: pub.accountType,
        ...(pub.experience ? { experience: pub.experience } : {}),
        ...(pub.goal ? { goal: pub.goal } : {}),
        // Stamped server-side. Skipping the questions still counts as done —
        // the screen must not come back and ask again.
        onboardedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // Only written when there is something to write: an empty merge would
    // create a pointless document and muddy a later "has the user filled
    // anything in?" check.
    if (Object.keys(priv).length > 0) {
      batch.set(db.doc(`users/${uid}/private/profile`), priv, { merge: true });
    }

    if (application) {
      // Keyed by uid: one pending request per account, and re-submitting
      // replaces rather than piling up.
      batch.set(
        db.doc(`partnerApplications/${uid}`),
        {
          uid,
          ...application,
          status: 'pending',
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    await batch.commit();

    return NextResponse.json({
      ok: true,
      applied: application !== null,
    });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

/** Read back the private half, for editing on /compte. Owner only. */
export async function GET(req: Request) {
  const uid = await uidFromToken(bearer(req));
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  try {
    const snap = await db.doc(`users/${uid}/private/profile`).get();
    return NextResponse.json({ profile: snap.exists ? snap.data() : {} });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
