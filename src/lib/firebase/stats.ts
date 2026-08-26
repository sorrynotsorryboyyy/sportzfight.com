'use client';

import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './client';
import { battleCoins, outcomeFor, xpFor } from '@/lib/progression/awards';
import { battleHistory } from './battles';
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

  try {
    // ---- phase 1: claim ----
    await updateDoc(userRef(uid), { pendingBattleId: battleId });
  } catch {
    // Denied means a receipt already exists, or the battle is not creditable.
    return NOTHING;
  }

  // Coins are NOT computed here: the personal-best bonus depends on the
  // bestScore committed before this battle, which settle() reads.
  return settle(uid, battleId, {
    reps,
    outcome,
    xp,
    vsBot: battle.botLevel != null,
  });
}

async function settle(
  uid: string,
  battleId: string,
  award: {
    reps: number;
    outcome: 'win' | 'loss' | 'draw';
    xp: number;
    /** Training battle: credited normally, but kept out of the ranking. */
    vsBot: boolean;
  },
): Promise<CreditResult> {
  const snap = await getDoc(userRef(uid));
  const cur = (snap.data() ?? {}) as Partial<UserDoc>;
  const was = (n: number | undefined) => n ?? 0;

  // Against the PRE-WRITE best, exactly as the rules compare it. Computing this
  // from the post-write value would award the bonus to every battle.
  const coins = battleCoins(award.outcome, award.reps, was(cur.bestScore));

  const batch = writeBatch(db());

  batch.set(receiptRef(uid, battleId), { at: serverTimestamp() });
  batch.update(userRef(uid), {
    pendingBattleId: null,
    battlesPlayed: was(cur.battlesPlayed) + 1,
    xp: was(cur.xp) + award.xp,
    coins: was(cur.coins) + coins,
    totalReps: was(cur.totalReps) + award.reps,
    wins: was(cur.wins) + (award.outcome === 'win' ? 1 : 0),
    // Only a win over a real account. The rules recompute this exactly, so a
    // client that inflated it would simply have its whole settle denied.
    humanWins:
      was(cur.humanWins) +
      (award.outcome === 'win' && !award.vsBot ? 1 : 0),
    losses: was(cur.losses) + (award.outcome === 'loss' ? 1 : 0),
    draws: was(cur.draws) + (award.outcome === 'draw' ? 1 : 0),
    bestScore: Math.max(was(cur.bestScore), award.reps),
  });

  try {
    await batch.commit();
    return { credited: true, xp: award.xp, coins };
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
    vsBot: battle.botLevel != null,
  });
}

/**
 * Pay out every finished battle that has no receipt yet.
 *
 * Crediting normally happens on the battle screen the moment the result lands,
 * but that only works if the player is still there: close the tab a second
 * early, lose the connection, or play a battle that finished before this
 * feature existed, and the XP was gone for good. Rules cannot backfill on
 * their own, so the account screen reconciles instead.
 *
 * Safe by construction — the receipt makes an already-paid battle a no-op, so
 * this can run on every visit without ever double-crediting.
 */
export async function reconcileCredits(
  uid: string,
  max = 20,
): Promise<{ credited: number; xp: number; coins: number }> {
  // Finish a half-done credit first, or its claim would block the loop below.
  await resumePendingCredit(uid).catch(() => {});

  const battles = await battleHistory(uid, max);
  let credited = 0;
  let xp = 0;
  let coins = 0;

  // Oldest first, so the history reads in the order it was played.
  for (const b of [...battles].reverse()) {
    const r = await creditBattle(uid, b.id, b).catch(() => NOTHING);
    if (r.credited) {
      credited++;
      xp += r.xp;
      coins += r.coins;
    }
  }

  return { credited, xp, coins };
}
