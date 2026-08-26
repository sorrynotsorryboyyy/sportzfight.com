'use client';

import {
  getDocs,
  limit,
  orderBy,
  query,
  collection,
  where,
} from 'firebase/firestore';
import { db } from './client';
import { serverNow } from './clock';
import {
  BattleError,
  cancelBattle,
  createBattle,
  joinBattleById,
} from './battles';
import { DEFAULT_DURATION_SECS, STALE_MS } from '@/lib/battle/constants';
import { DEFAULT_EXERCISE } from '@/lib/exercise/registry';
import type { BattleDoc, BattleWithId } from '@/lib/battle/types';

/**
 * Random matchmaking.
 *
 * Firestore has no atomic find-and-claim across documents — but it does have a
 * per-document one: the `validJoin` security rule is evaluated against the
 * committed pre-image inside the commit, so of N simultaneous claimants on one
 * battle, exactly one wins and the rest are denied. Matchmaking therefore
 * reduces to: gather plausible candidates, then attempt that atomic claim on
 * them one at a time until one sticks.
 *
 * The genuinely hard case is the empty pool: two people search at the same
 * instant, both find nothing, both create a battle, and both wait forever.
 * That is solved by re-scanning *after* creating (phase B) — each then sees the
 * other's battle. See `findOrCreateBattle` for how the resulting symmetric
 * A-joins-B / B-joins-A race is broken.
 */

/** How many candidates to pull per scan. */
const CANDIDATE_LIMIT = 10;
/** How many claims to attempt before giving up on a scan pass. */
const JOIN_ATTEMPTS = 5;
/** Full scan→create→rescan cycles before surrendering. */
const MAX_ROUNDS = 3;
/** Let a simultaneous creator's document land before re-scanning. */
const RESCAN_DELAY_MS = 400;
/** Backoff between failed claim attempts. */
const BACKOFF_MS = [150, 300, 600, 1200];
/** A battle abandoned this long may be reaped by anyone (mirrors the rules). */
const ABANDON_MS = 60 * 60 * 1000;

export type MatchRole = 'player1' | 'player2';

export interface MatchResult {
  id: string;
  /** player2 means we claimed someone's battle; player1 means we are waiting. */
  role: MatchRole;
}

export class MatchmakingError extends Error {
  constructor(message = 'Matchmaking indisponible. Réessaie.') {
    super(message);
    this.name = 'MatchmakingError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms: number) => ms + Math.random() * 250;

/** Fisher-Yates, so simultaneous searchers spread across the pool. */
function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const isFresh = (b: BattleDoc): boolean => {
  const hb = b.player1HeartbeatAt;
  if (!hb) return false;
  return serverNow() - hb.toMillis() <= STALE_MS;
};

/**
 * Candidate battles we could plausibly join.
 *
 * Note the deliberate absence of `where('player1','!=',uid)`. Firestore
 * requires the first orderBy to match an inequality field, which would force
 * ordering by an opaque uid — destroying "newest first" and, worse, making
 * every client's limited window converge on the same lowest-uid battles. We
 * filter our own out on the client instead; `joinBattleById` and the security
 * rule are the real guards.
 */
async function scanCandidates(
  uid: string,
  exercise: string,
  durationSecs: number,
  /** Phase B only: ignore candidates that do not sort below our own battle. */
  belowId: string | null,
): Promise<BattleWithId[]> {
  const snap = await getDocs(
    query(
      collection(db(), 'battles'),
      where('status', '==', 'waiting'),
      where('exercise', '==', exercise),
      where('durationSecs', '==', durationSecs),
      orderBy('createdAt', 'desc'),
      limit(CANDIDATE_LIMIT),
    ),
  );

  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as BattleDoc) }));

  // Opportunistic garbage collection: without Cloud Functions there is no
  // scheduled reaper, so every search sweeps a little. Never awaited — this
  // must not add latency to matchmaking.
  for (const b of all) {
    const created = b.createdAt?.toMillis?.();
    if (b.player1 !== uid && !isFresh(b) && created && serverNow() - created > ABANDON_MS) {
      void cancelBattle(b.id).catch(() => {});
    }
  }

  const usable = all.filter(
    (b) =>
      b.player1 !== uid &&
      b.player2 === null &&
      isFresh(b) &&
      (belowId === null || b.id < belowId),
  );

  return shuffle(usable);
}

/** Try to claim candidates in order. Returns the id we got, or null. */
async function attemptClaims(
  uid: string,
  candidates: BattleWithId[],
): Promise<string | null> {
  const tries = candidates.slice(0, JOIN_ATTEMPTS);

  for (let i = 0; i < tries.length; i++) {
    try {
      await joinBattleById(uid, tries[i].id);
      return tries[i].id;
    } catch (e) {
      // A denial here is the normal outcome of losing a race, not an error:
      // someone claimed this battle between our scan and our commit.
      const expected =
        e instanceof BattleError ||
        (e as { code?: string })?.code === 'permission-denied' ||
        (e as { code?: string })?.code === 'aborted' ||
        (e as { code?: string })?.code === 'failed-precondition';
      if (!expected) throw e;

      if (i < tries.length - 1) {
        await sleep(BACKOFF_MS[Math.min(i, BACKOFF_MS.length - 1)] + Math.random() * 100);
      }
    }
  }
  return null;
}

/**
 * Find an opponent, or post a battle and wait for one.
 *
 * Phase A joins someone already waiting. Phase B creates our own battle and
 * re-scans, which is what stops two simultaneous searchers from both sitting
 * alone. Phase C returns our own battle to wait in.
 *
 * The phase-B re-scan creates one hazard: A and B could each successfully
 * claim the other's battle, producing two half-full battles and one very
 * confused pair. It is broken with a tie-break on document id — we only claim
 * a candidate that sorts strictly below our own battle. Ids are random, so
 * both sides independently agree on which of them is allowed to move, with no
 * extra reads and no extra fields.
 */
export async function findOrCreateBattle(
  uid: string,
  exercise = DEFAULT_EXERCISE,
  durationSecs = DEFAULT_DURATION_SECS,
): Promise<MatchResult> {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    // ---- phase A: join somebody already waiting ----
    const joined = await attemptClaims(
      uid,
      await scanCandidates(uid, exercise, durationSecs, null),
    );
    if (joined) return { id: joined, role: 'player2' };

    // ---- phase B: post our own, then look again ----
    let myId: string;
    try {
      // Marked bot-capable at birth: a battle cannot become one later (no
      // update rule touches botLevel), so the decision has to be made here.
      // A real player joining first simply takes the seat and the marker is
      // never acted on.
      myId = await createBattle(uid, exercise, durationSecs, {
        level: 'normal',
        seed: Math.floor(Math.random() * 1_000_000),
      });
    } catch {
      continue; // transient write failure: start the round over
    }

    await sleep(jitter(RESCAN_DELAY_MS));

    const joinedLate = await attemptClaims(
      uid,
      await scanCandidates(uid, exercise, durationSecs, myId),
    );
    if (joinedLate) {
      // We are playing elsewhere; do not leave a ghost in the pool.
      void cancelBattle(myId).catch(() => {});
      return { id: joinedLate, role: 'player2' };
    }

    // ---- phase C: wait to be joined ----
    return { id: myId, role: 'player1' };
  }

  throw new MatchmakingError();
}
