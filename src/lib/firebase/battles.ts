'use client';

import {
  collection,
  doc,
  getDoc,
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
import { DEFAULT_DURATION_SECS } from '@/lib/battle/constants';
import { DEFAULT_EXERCISE } from '@/lib/exercise/registry';
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

/**
 * Create a battle with this user as player1, waiting for an opponent.
 *
 * The creator stamps its own heartbeat here rather than waiting for the battle
 * screen to mount: matchmaking ranks candidates by heartbeat freshness, so a
 * battle created with a null heartbeat would be invisible to every other
 * searcher for the few hundred ms until the subscription resolves. The rules
 * require this field to equal request.time.
 */
export async function createBattle(
  uid: string,
  exercise = DEFAULT_EXERCISE,
  durationSecs = DEFAULT_DURATION_SECS,
): Promise<string> {
  const ref = doc(battlesCol());
  const { setDoc } = await import('firebase/firestore');

  await setDoc(ref, {
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
    player1HeartbeatAt: serverTimestamp(),
    player2HeartbeatAt: null,
    winner: null,
    endReason: null,
    createdAt: serverTimestamp(),
    startedAt: null,
    endedAt: null,
  });

  return ref.id;
}

export async function getBattle(id: string): Promise<BattleWithId | null> {
  const snap = await getDoc(battleRef(id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as BattleDoc) };
}

/**
 * Claim the second slot of a specific battle.
 *
 * The security rule is what actually prevents a third player: it is a
 * compare-and-swap evaluated against the committed document inside the commit,
 * so of N simultaneous claimants exactly one wins. This transaction exists to
 * read from the server (transaction reads bypass the local cache) and to turn
 * a lost race into a typed error instead of a raw permission failure.
 */
export async function joinBattleById(uid: string, id: string): Promise<void> {
  const ref = battleRef(id);

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
      player2HeartbeatAt: serverTimestamp(),
    });
  });
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

/**
 * A player's finished battles, newest first. Powers the account history.
 * Needs the players+status+endedAt composite index.
 */
export async function battleHistory(
  uid: string,
  max = 20,
): Promise<BattleWithId[]> {
  try {
    const snap = await getDocs(
      query(
        battlesCol(),
        where('players', 'array-contains', uid),
        where('status', '==', 'finished'),
        orderBy('endedAt', 'desc'),
        limit(max),
      ),
    );
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as BattleDoc) }));
  } catch {
    return [];
  }
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
