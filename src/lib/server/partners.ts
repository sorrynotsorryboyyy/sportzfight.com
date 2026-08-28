import type { Firestore } from 'firebase-admin/firestore';
import { defaultRates } from '@/lib/partners/commission';
import type { PartnerKind } from '@/lib/partners/types';

/**
 * Creating a partner, with the code lock.
 *
 * Shared by /api/admin/partners and /api/admin/applications because they used
 * to hold two copies of this, and two copies is exactly how a lock gets added
 * to one path and forgotten on the other.
 *
 * THE RACE THIS CLOSES. Both routes did a `where('code','==',code).limit(1)`
 * and then an `add()`. Two admins creating FITPRO at the same moment both saw
 * an empty result and both wrote, leaving two partners on one code. Nothing
 * would have surfaced it: /api/referral and /p/[code] both resolve a code with
 * `.limit(1)`, so one partner would silently receive every one of the other's
 * referrals — and their commission — while both dashboards looked plausible.
 *
 * The fix is the pattern already used for usernames (see /api/username): a
 * lock document whose id IS the unique value, claimed inside a transaction.
 * Firestore aborts and retries the transaction if the lock changed underneath,
 * which is the guarantee read-then-write never had.
 *
 * Unlike usernames, no key derivation is needed: normaliseCode already
 * uppercases and strips, so the code is its own canonical key.
 */

export interface NewPartner {
  /** Already normalised and validated by the caller. */
  code: string;
  name: string;
  kind: PartnerKind;
  ownerUid?: string | null;
  city?: string | null;
  blurb?: string | null;
  rateFirstBps?: number;
  rateRecurringBps?: number;
}

export type CreatePartnerResult =
  | { ok: true; id: string; code: string }
  | { ok: false; reason: 'code_taken' };

export async function createPartner(
  db: Firestore,
  input: NewPartner,
): Promise<CreatePartnerResult> {
  const rates = defaultRates();
  const lock = db.doc(`partnerCodes/${input.code}`);
  const ref = db.collection('partners').doc();

  const outcome = await db.runTransaction(async (tx) => {
    if ((await tx.get(lock)).exists) return 'taken' as const;

    tx.set(lock, { partnerId: ref.id, createdAt: new Date() });
    tx.set(ref, {
      code: input.code,
      name: input.name,
      kind: input.kind,
      ownerUid: input.ownerUid ?? null,
      rateFirstBps: input.rateFirstBps ?? rates.rateFirstBps,
      rateRecurringBps: input.rateRecurringBps ?? rates.rateRecurringBps,
      city: input.city ?? null,
      blurb: input.blurb ?? null,
      logoUrl: null,
      active: true,
      createdAt: new Date(),
    });
    return 'ok' as const;
  });

  if (outcome === 'taken') return { ok: false, reason: 'code_taken' };
  return { ok: true, id: ref.id, code: input.code };
}

/**
 * Claim locks for partners that predate the lock collection.
 *
 * Without this, an old partner's code is unlocked: someone could create a
 * second partner on it and start collecting their referrals. Runs alongside
 * the rate migration, and skips any code already locked so it is safe to
 * repeat.
 */
export async function backfillCodeLocks(
  db: Firestore,
): Promise<{ locked: number; conflicts: string[] }> {
  const all = await db.collection('partners').get();
  const conflicts: string[] = [];
  let locked = 0;

  for (const doc of all.docs) {
    const code = doc.get('code') as string | undefined;
    if (!code) continue;

    const lock = db.doc(`partnerCodes/${code}`);
    const done = await db.runTransaction(async (tx) => {
      const snap = await tx.get(lock);
      if (snap.exists) {
        // Already locked by a DIFFERENT partner: the duplicate this whole
        // change exists to prevent already happened. Report it rather than
        // pick a winner — which of two partners owns a code, and therefore
        // whose commission is whose, is not a decision code should make.
        return snap.get('partnerId') === doc.id ? 'same' : 'conflict';
      }
      tx.set(lock, { partnerId: doc.id, createdAt: new Date() });
      return 'locked';
    });

    if (done === 'locked') locked += 1;
    if (done === 'conflict') conflicts.push(code);
  }

  return { locked, conflicts };
}
