import { NextResponse } from 'next/server';
import { adminDb, bearer, uidFromToken } from '@/lib/server/firebase-admin';
import {
  USERNAME_RE,
  usernameKey,
  validateUsername,
} from '@/lib/utils/username';

/**
 * Change a username, holding the lock and the profile together.
 *
 * This exists because the client could not be trusted with it. The old rule
 * checked the CHARSET of `users/{uid}.username` but never the lock, so a
 * modified client could display a name reserved by someone else and put two
 * identical players on the leaderboard. Rules cannot close that: they have no
 * toLower(), so they cannot derive a name's lock key.
 *
 * Here both documents move in one Admin SDK transaction, and the rules now
 * deny `username` to every client path.
 */

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const uid = await uidFromToken(bearer(req));
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let raw: unknown;
  try {
    ({ username: raw } = (await req.json()) as { username?: unknown });
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const next = typeof raw === 'string' ? raw.trim() : '';

  // Same validator the client uses, re-run here because the client's copy is
  // advice and this one is the decision.
  const problem = validateUsername(next);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (!USERNAME_RE.test(next)) {
    return NextResponse.json({ error: 'bad-chars' }, { status: 400 });
  }

  const nextKey = usernameKey(next);

  try {
    const userRef = db.doc(`users/${uid}`);
    const nextLock = db.doc(`usernames/${nextKey}`);

    const result = await db.runTransaction(async (tx) => {
      const [userSnap, lockSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(nextLock),
      ]);

      if (!userSnap.exists) return 'no_profile' as const;

      const current = userSnap.get('username') as string | undefined;
      const currentKey = current ? usernameKey(current) : null;

      if (lockSnap.exists && lockSnap.get('uid') !== uid) {
        return 'taken' as const;
      }

      // "Rocky" -> "rocky" is the same lock document, so releasing it would
      // delete the very key being claimed.
      if (currentKey && currentKey !== nextKey) {
        tx.delete(db.doc(`usernames/${currentKey}`));
      }
      if (!lockSnap.exists) {
        tx.set(nextLock, { uid });
      }

      tx.update(userRef, { username: next });
      return 'ok' as const;
    });

    if (result === 'taken') {
      return NextResponse.json({ error: 'taken' }, { status: 409 });
    }
    if (result === 'no_profile') {
      return NextResponse.json({ error: 'no_profile' }, { status: 404 });
    }

    return NextResponse.json({ username: next });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
