'use client';

import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './client';
import { generateCode } from '@/lib/utils/code';
import { DEFAULT_DURATION_SECS } from '@/lib/battle/constants';
import type {
  BattleDoc,
  BattleWithId,
  EndReason,
  PlayerSlot,
  ScoreMeta,
} from '@/lib/battle/types';

/**
 * All battle mutations. Every write here is also validated by firestore.rules,
 * which is the actual authority — these functions exist to produce clean
 * errors and to keep the write shapes in one place.
 */

export class BattleError extends Error {
  constructor(
    public code:
      | 'not-found'
      | 'full'
      | 'own-battle'
      | 'already-started'
      | 'not-ready'
      | 'denied',
    message: string,
  ) {
    super(message);
    this.name = 'BattleError';
  }
}

const battlesCol = () => collection(db(), 'battles');
export const battleRef = (id: string) => doc(db(), 'battles', id);

/** Create a battle with a unique code, retrying on the (rare) collision. */
export async function createBattle(
  uid: string,
  exercise = 'pushups',
  durationSecs = DEFAULT_DURATION_SECS,
): Promise<{ id: string; code: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const existing = await getDocs(
      query(battlesCol(), where('code', '==', code), limit(1)),
    );
    if (!existing.empty) continue;

    const ref = doc(battlesCol());
    const payload: Record<string, unknown> = {
      code,
      exercise,
      durationSecs,
      status: 'waiting',
      player1: uid,
      player2: null,
      players: [uid],
      player1Ready: false,
      player2Ready: false,
      player1Score: 0,
      player2Score: 0,
      player1Final: false,
      player2Final: false,
      player1Meta: { autoReps: 0, manualAdjust: 0, source: 'camera' },
      player2Meta: { autoReps: 0, manualAdjust: 0, source: 'camera' },
      player1HeartbeatAt: null,
      player2HeartbeatAt: null,
      winner: null,
      endReason: null,
      createdAt: serverTimestamp(),
      startedAt: null,
      endedAt: null,
    };
    const { setDoc } = await import('firebase/firestore');
    await setDoc(ref, payload);
    return { id: ref.id, code };
  }
  throw new BattleError('denied', 'Impossible de générer un code unique. Réessaie.');
}

/** Look up an open battle by its share code. */
export async function findBattleByCode(code: string): Promise<BattleWithId | null> {
  const snap = await getDocs(query(battlesCol(), where('code', '==', code), limit(1)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as BattleDoc) };
}

/**
 * Join a battle as player2.
 *
 * The security rule is what actually prevents a third player (it is a
 * compare-and-swap against the committed document). This transaction exists so
 * the user gets "battle complet" instead of an opaque permission error, and
 * because transaction reads always hit the server rather than the local cache.
 */
export async function joinBattle(uid: string, code: string): Promise<string> {
  const found = await findBattleByCode(code);
  if (!found) throw new BattleError('not-found', 'Aucun battle avec ce code.');

  const ref = battleRef(found.id);

  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new BattleError('not-found', 'Ce battle n’existe plus.');
    const b = snap.data() as BattleDoc;

    if (b.player1 === uid) {
      throw new BattleError('own-battle', 'C’est ton propre battle.');
    }
    if (b.player2 === uid) return; // idempotent rejoin
    if (b.player2) throw new BattleError('full', 'Ce battle est déjà complet.');
    if (b.status !== 'waiting') {
      throw new BattleError('already-started', 'Ce battle a déjà commencé.');
    }

    tx.update(ref, {
      player2: uid,
      players: [b.player1, uid],
      status: 'ready',
    });
  });

  return found.id;
}

export async function setReady(id: string, slot: PlayerSlot, ready: boolean) {
  await updateDoc(battleRef(id), {
    [slot === 1 ? 'player1Ready' : 'player2Ready']: ready,
  });
}

/**
 * Arm the battle. Only player1 does this normally; player2 may take over if
 * player1's heartbeat has gone stale (the rule enforces the window server-side).
 *
 * startedAt is write-once, so a double-tap or a React double-effect yields one
 * write and one harmless denial. Returns true if this call started it.
 */
export async function startBattle(id: string): Promise<boolean> {
  const ref = battleRef(id);
  try {
    return await runTransaction(db(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return false;
      const b = snap.data() as BattleDoc;

      if (b.startedAt) return false; // already armed by the other side
      if (!b.player2 || !b.player1Ready || !b.player2Ready) return false;

      tx.update(ref, { status: 'live', startedAt: serverTimestamp() });
      return true;
    });
  } catch {
    // Lost the race, or the rule refused. The snapshot will tell us the truth.
    return false;
  }
}

/**
 * Flush a score. `final` latches the last write of the battle.
 *
 * Scores must be monotonic on the wire (the rule rejects a decrease), which is
 * why callers pass their running maximum rather than a raw local count.
 */
export async function flushScore(
  id: string,
  slot: PlayerSlot,
  score: number,
  meta: ScoreMeta,
  final = false,
): Promise<void> {
  await updateDoc(battleRef(id), {
    [slot === 1 ? 'player1Score' : 'player2Score']: score,
    [slot === 1 ? 'player1Meta' : 'player2Meta']: meta,
    [slot === 1 ? 'player1Final' : 'player2Final']: final,
  });
}

export async function heartbeat(id: string, slot: PlayerSlot): Promise<void> {
  try {
    await updateDoc(battleRef(id), {
      [slot === 1 ? 'player1HeartbeatAt' : 'player2HeartbeatAt']: serverTimestamp(),
    });
  } catch {
    /* a missed beat is not fatal; the next one carries the same information */
  }
}

/**
 * Close out the battle. The winner passed here MUST equal the comparison the
 * rules recompute from the stored scores, otherwise the write is rejected —
 * this is the mechanism that stops a client naming itself the winner.
 */
export async function finishBattle(
  id: string,
  winner: string | 'draw',
  endReason: EndReason = 'time',
): Promise<boolean> {
  try {
    await updateDoc(battleRef(id), {
      status: 'finished',
      endedAt: serverTimestamp(),
      endReason,
      winner,
    });
    return true;
  } catch {
    // Someone else finalized first, or we were too early. Harmless.
    return false;
  }
}

export async function cancelBattle(id: string): Promise<void> {
  await updateDoc(battleRef(id), {
    status: 'cancelled',
    endReason: 'abandoned',
    endedAt: serverTimestamp(),
  });
}

export function subscribeBattle(
  id: string,
  cb: (b: BattleWithId | null, fromCache: boolean) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    battleRef(id),
    { includeMetadataChanges: true },
    (snap) => {
      if (!snap.exists()) return cb(null, snap.metadata.fromCache);
      cb(
        { id: snap.id, ...(snap.data() as BattleDoc) },
        snap.metadata.fromCache,
      );
    },
    (err) => onError?.(err),
  );
}

/** Recent finished battles, for the landing page. */
export async function recentBattles(max = 5): Promise<BattleWithId[]> {
  try {
    const snap = await getDocs(
      query(
        battlesCol(),
        where('status', '==', 'finished'),
        orderBy('endedAt', 'desc'),
        limit(max),
      ),
    );
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as BattleDoc) }));
  } catch {
    // Missing index or offline — the landing page treats this as "nothing yet".
    return [];
  }
}
