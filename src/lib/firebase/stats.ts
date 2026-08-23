'use client';

import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './client';
import { coinsFor, outcomeFor, xpFor } from '@/lib/progression/awards';
import type { BattleDoc, UserDoc } from '@/lib/battle/types';

/**
 * Crediting a finished battle to a player's counters.
 *
 * The security rules verify every number against the battle document itself,
 * so a client cannot claim a win it lost or inflate its reps. What rules cannot
 * do is remember: they see one write at a time and have no memory of previous
 * ones. So the guard against replaying a battle to farm XP is a RECEIPT
 * document, and the write is split into two phases the rules enforce in order:
 *
 *   1. claim  — set pendingBattleId, allowed only if no receipt exists yet
 *   2. settle — one batch: create the receipt AND bump the counters
 *
 * A batch is atomic, so phase 2 either lands whole or not at all. If the client
 * dies between the phases the claim is simply left set, and `resumePending`
 * finishes it on the next load.
 */

const userRef = (uid: string) => doc(db(), 'users', uid);
const receiptRef = (uid: string, battleId: string) =>
  doc(db(), 'users', uid, 'creditedBattles', battleId);

export interface CreditResult {
  credited: boolean;
  xp: number;
  coins: number;
}

const NOTHING: CreditResult = { credited: false, xp: 0, coins: 0 };

/**
 * Award one finished battle to `uid`. Safe to call repeatedly: the receipt
 * makes a second attempt a no-op rather than a double payout.
 */
export async function creditBattle(
  uid: string,
  battleId: string,
  battle: BattleDoc,
): Promise<CreditResult> {
  // Only real head-to-head results pay out.
  if (battle.status !== 'finished' || !battle.player2) return NOTHING;
  if (!battle.players.includes(uid)) return NOTHING;

  // Cheap local short-circuit; the rules enforce this regardless.
  if ((await getDoc(receiptRef(uid, battleId))).exists()) return NOTHING;

  const reps = uid === battle.player1 ? battle.player1Score : battle.player2Score;
  const outcome = outcomeFor(battle.winner, uid);
  const xp = xpFor(outcome, reps);
  const coins = coinsFor(outcome);

  try {
    // ---- phase 1: claim ----
    await updateDoc(userRef(uid), { pendingBattleId: battleId });
  } catch {
    // Denied means a receipt already exists, or the battle is not creditable.
    return NOTHING;
  }

  return settle(uid, battleId, { reps, outcome, xp, coins });
}

async function settle(
  uid: string,
  battleId: string,
  award: {
    reps: number;
    outcome: 'win' | 'loss' | 'draw';
    xp: number;
    coins: number;
  },
): Promise<CreditResult> {
  const snap = await getDoc(userRef(uid));
  const cur = (snap.data() ?? {}) as Partial<UserDoc>;
  const was = (n: number | undefined) => n ?? 0;

  const batch = writeBatch(db());

  batch.set(receiptRef(uid, battleId), { at: serverTimestamp() });
  batch.update(userRef(uid), {
    pendingBattleId: null,
    battlesPlayed: was(cur.battlesPlayed) + 1,
    xp: was(cur.xp) + award.xp,
    coins: was(cur.coins) + award.coins,
    totalReps: was(cur.totalReps) + award.reps,
    wins: was(cur.wins) + (award.outcome === 'win' ? 1 : 0),
    losses: was(cur.losses) + (award.outcome === 'loss' ? 1 : 0),
    draws: was(cur.draws) + (award.outcome === 'draw' ? 1 : 0),
    bestScore: Math.max(was(cur.bestScore), award.reps),
  });

  try {
    await batch.commit();
    return { credited: true, xp: award.xp, coins: award.coins };
  } catch {
    // The counters did not move. Drop the claim so the account is not wedged
    // holding a pending battle it can never settle.
    await updateDoc(userRef(uid), { pendingBattleId: null }).catch(() => {});
    return NOTHING;
  }
}

/**
 * Finish a credit that was claimed but never settled, e.g. the tab closed
 * between the two phases. Called on load from the account screen.
 */
export async function resumePendingCredit(uid: string): Promise<CreditResult> {
  const snap = await getDoc(userRef(uid));
  const pending = (snap.data() as Partial<UserDoc> | undefined)?.pendingBattleId;
  if (!pending) return NOTHING;

  const bSnap = await getDoc(doc(db(), 'battles', pending));
  if (!bSnap.exists()) {
    await updateDoc(userRef(uid), { pendingBattleId: null }).catch(() => {});
    return NOTHING;
  }

  const battle = bSnap.data() as BattleDoc;
  const reps = uid === battle.player1 ? battle.player1Score : battle.player2Score;
  const outcome = outcomeFor(battle.winner, uid);

  return settle(uid, pending, {
    reps,
    outcome,
    xp: xpFor(outcome, reps),
    coins: coinsFor(outcome),
  });
}
