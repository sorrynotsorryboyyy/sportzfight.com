'use client';

import { apiPost } from './api';
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './client';
import {
  sanitizeToUsername,
  usernameKey,
  validateUsername,
  USERNAME_MESSAGES,
} from '@/lib/utils/username';

/**
 * Profile identity: the username and the lock that makes it unique.
 *
 * Firestore rules cannot run a query, so uniqueness needs a lock document.
 * `usernames/{lowercased}` holds `{ uid }` and may only be created when it does
 * not already exist. Renaming releases the old lock and claims the new one in a
 * single transaction, so a name is never half-transferred.
 */

export class UsernameError extends Error {
  constructor(
    public code: 'taken' | 'invalid' | 'denied' | 'unchanged',
    message: string,
  ) {
    super(message);
    this.name = 'UsernameError';
  }
}

const lockRef = (name: string) => doc(db(), 'usernames', usernameKey(name));
const userRef = (uid: string) => doc(db(), 'users', uid);

/** Is this name free? Advisory only — the transaction is the real check. */
export async function isUsernameAvailable(
  name: string,
  selfUid?: string,
): Promise<boolean> {
  try {
    const snap = await getDoc(lockRef(name));
    if (!snap.exists()) return true;
    // Your own current name reads as available so re-submitting is not an error.
    return snap.data()?.uid === selfUid;
  } catch {
    return false;
  }
}

/**
 * Claim `next` for `uid`, releasing `current` if there was one.
 *
 * Both writes live in one transaction: a crash cannot leave the user holding
 * two locks or none. The rules forbid updating a lock in place, so a claim can
 * only ever succeed against a genuinely free name.
 */
export async function changeUsername(
  uid: string,
  next: string,
  current: string | null,
): Promise<void> {
  const clean = next.trim();

  const problem = validateUsername(clean);
  if (problem) throw new UsernameError('invalid', USERNAME_MESSAGES[problem]);

  if (current && current === clean) {
    throw new UsernameError('unchanged', 'C\u2019est d\u00e9j\u00e0 ton pseudo.');
  }

  // Delegated to the server. The client used to run this transaction itself,
  // but the rules could only check the CHARSET of users/{uid}.username, never
  // the lock — they have no toLower() and so cannot derive a name's lock key.
  // A modified client could therefore display a name someone else had
  // reserved, putting two identical players on the leaderboard.
  //
  // The route holds both documents in one Admin SDK transaction, and the rules
  // now deny `username` on every client path.
  const r = await apiPost<{ username: string }>('/api/username', {
    username: clean,
  });

  if (r.ok) return;

  if (r.status === 409) {
    throw new UsernameError('taken', 'Ce pseudo est d\u00e9j\u00e0 pris.');
  }
  if (r.status === 400 && r.error && r.error in USERNAME_MESSAGES) {
    throw new UsernameError(
      'invalid',
      USERNAME_MESSAGES[r.error as keyof typeof USERNAME_MESSAGES],
    );
  }
  throw new UsernameError(
    'denied',
    'Impossible de changer le pseudo. R\u00e9essaie.',
  );
}

/**
 * Create users/{uid} on first sign-in, with a username the charset accepts.
 *
 * The Google display name usually is not valid ("Léo Chevalier" has a space and
 * an accent), so it is sanitised rather than rejected — "LeoChevalier" stays
 * recognisable. If the sanitised name is taken, a numeric suffix is appended.
 */
export async function ensureProfile(user: {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}): Promise<void> {
  const ref = userRef(user.uid);
  if ((await getDoc(ref)).exists()) return;

  const base = sanitizeToUsername(
    user.displayName || user.email?.split('@')[0] || 'Athlete',
  );

  // Try the clean name, then a few suffixed variants. Bounded: the lock write
  // is authoritative, so a loser simply tries the next candidate.
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate =
      attempt === 0 ? base : `${base.slice(0, 12)}${Math.floor(Math.random() * 9000) + 1000}`;

    try {
      await runTransaction(db(), async (tx) => {
        const lock = lockRef(candidate);
        const held = await tx.get(lock);
        if (held.exists()) throw new UsernameError('taken', 'taken');

        tx.set(lock, { uid: user.uid });
        tx.set(ref, {
          username: candidate,
          avatar: user.photoURL ?? null,
          createdAt: serverTimestamp(),
        });
      });

      // Email is deliberately NOT on the profile document: that document is
      // listable by any signed-in client for the leaderboard, so anything
      // personal on it would be harvestable. Owner-only subcollection instead.
      await setDoc(doc(db(), 'users', user.uid, 'private', 'contact'), {
        email: user.email ?? '',
      }).catch(() => {
        /* non-fatal: nothing in the app reads this back today */
      });
      return;
    } catch (e) {
      if (e instanceof UsernameError && e.code === 'taken') continue;
      throw e;
    }
  }

  throw new UsernameError('taken', 'Impossible de réserver un pseudo.');
}
