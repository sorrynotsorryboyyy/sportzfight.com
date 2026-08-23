'use client';

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

  const sameKey = current && usernameKey(current) === usernameKey(clean);
  if (sameKey && current === clean) {
    throw new UsernameError('unchanged', 'C’est déjà ton pseudo.');
  }

  try {
    await runTransaction(db(), async (tx) => {
      const nextLock = lockRef(clean);
      const existing = await tx.get(nextLock);

      if (existing.exists() && existing.data()?.uid !== uid) {
        throw new UsernameError('taken', 'Ce pseudo est déjà pris.');
      }

      // Release the previous lock only when the key genuinely changes;
      // "Rocky" -> "rocky" keeps the same document.
      if (current && !sameKey) {
        tx.delete(lockRef(current));
      }
      if (!existing.exists()) {
        tx.set(nextLock, { uid });
      }

      tx.update(userRef(uid), { username: clean });
    });
  } catch (e) {
    if (e instanceof UsernameError) throw e;
    throw new UsernameError(
      'denied',
      'Impossible de changer le pseudo. Réessaie.',
    );
  }
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

/** Claim a lock for a legacy account that has a username but no lock yet. */
export async function claimLegacyUsername(
  uid: string,
  next: string,
): Promise<void> {
  await changeUsername(uid, next, null);
}
