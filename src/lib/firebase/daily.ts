'use client';

import {
  Timestamp,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from './client';
import { battleHistory } from './battles';
import {
  DAILY_GOAL_BATTLES,
  STREAK_GRACE_HOURS,
  STREAK_WINDOW_HOURS,
  bonusForStreak,
} from '@/lib/progression/awards';
import type { UserDoc } from '@/lib/battle/types';

/**
 * The daily streak bonus.
 *
 * This is the retention mechanism: playing more within a day earns almost
 * nothing, but coming back on consecutive days pays real amounts. A "day" is a
 * rolling 20-hour window rather than a calendar date, because rules have no
 * timezone and a UTC midnight lands mid-evening in France.
 *
 * Like the battle payout, it is two phases the rules enforce in order — and for
 * the same reason: rules cannot see sibling writes in a batch, so the proof has
 * to be committed before the money moves.
 *
 *   1. receipt — create users/{uid}/dailyBonus/{k}, naming the three battles
 *                that satisfy the objective. The rules verify each one and
 *                stamp `at` with the server clock.
 *   2. payout  — bump coins and streak, checked against that committed receipt.
 *
 * A client that dies between the two has a receipt it earned and no payment;
 * the next call finishes it. The reverse order would pay before proving.
 */

const userRef = (uid: string) => doc(db(), 'users', uid);
const bonusRef = (uid: string, k: number) =>
  doc(db(), 'users', uid, 'dailyBonus', String(k));

const HOUR_MS = 3_600_000;

export interface DailyStatus {
  /** Consecutive days already claimed. */
  streak: number;
  /** Finished battles available toward today's objective. */
  progress: number;
  /** How many are needed. */
  goal: number;
  /** True when the bonus can be claimed right now. */
  claimable: boolean;
  /** What claiming would pay. */
  reward: number;
  /** When the next claim becomes possible; null when it already is. */
  nextAt: Date | null;
}

const NOTHING: DailyStatus = {
  streak: 0,
  progress: 0,
  goal: DAILY_GOAL_BATTLES,
  claimable: false,
  reward: 0,
  nextAt: null,
};

function asDate(t: unknown): Date | null {
  return t instanceof Timestamp ? t.toDate() : null;
}

/**
 * What the streak looks like right now, and whether a bonus is due.
 *
 * Read-only: computing this never writes, so it is safe to call on render.
 */
export async function dailyStatus(uid: string): Promise<DailyStatus> {
  try {
    const snap = await getDoc(userRef(uid));
    const me = (snap.data() ?? {}) as Partial<UserDoc>;

    const last = asDate(me.lastBonusAt);
    const streak = me.streak ?? 0;
    const since = last ? Date.now() - last.getTime() : Infinity;

    // Past the grace period the streak is over; the next claim restarts at 1.
    const alive = since <= STREAK_GRACE_HOURS * HOUR_MS;
    const nextStreak = alive ? streak + 1 : 1;

    // The window has to have elapsed before another claim is possible.
    const open = since >= STREAK_WINDOW_HOURS * HOUR_MS;
    const nextAt =
      open || !last
        ? null
        : new Date(last.getTime() + STREAK_WINDOW_HOURS * HOUR_MS);

    const progress = (await eligibleBattles(uid, last)).length;

    return {
      streak: alive ? streak : 0,
      progress: Math.min(progress, DAILY_GOAL_BATTLES),
      goal: DAILY_GOAL_BATTLES,
      claimable: open && progress >= DAILY_GOAL_BATTLES,
      reward: bonusForStreak(nextStreak),
      nextAt,
    };
  } catch {
    return NOTHING;
  }
}

/**
 * Finished battles that count toward the objective: concluded after the last
 * bonus, so one good day cannot be replayed to farm a streak. The rules check
 * this independently — this is only to avoid attempting a doomed write.
 */
async function eligibleBattles(uid: string, since: Date | null): Promise<string[]> {
  const history = await battleHistory(uid, 20);
  return history
    .filter((b) => {
      const ended = asDate(b.endedAt);
      if (!ended) return false;
      return since ? ended.getTime() > since.getTime() : true;
    })
    .map((b) => b.id);
}

export interface ClaimResult {
  claimed: boolean;
  coins: number;
  streak: number;
}

const UNCLAIMED: ClaimResult = { claimed: false, coins: 0, streak: 0 };

/**
 * Claim today's bonus. Safe to call repeatedly: a second attempt in the same
 * window is refused by the rules rather than paid twice.
 */
export async function claimDailyBonus(uid: string): Promise<ClaimResult> {
  try {
    const snap = await getDoc(userRef(uid));
    if (!snap.exists()) return UNCLAIMED;
    const me = snap.data() as Partial<UserDoc>;

    const last = asDate(me.lastBonusAt);
    const since = last ? Date.now() - last.getTime() : Infinity;
    if (since < STREAK_WINDOW_HOURS * HOUR_MS) return UNCLAIMED;

    const alive = since <= STREAK_GRACE_HOURS * HOUR_MS;
    const streak = alive ? (me.streak ?? 0) + 1 : 1;
    const count = (me.bonusCount ?? 0) + 1;

    const battles = await eligibleBattles(uid, last);
    if (battles.length < DAILY_GOAL_BATTLES) return UNCLAIMED;
    const [b1, b2, b3] = battles;

    // ---- phase 1: the receipt, which is what proves the claim ----
    try {
      await setDoc(bonusRef(uid, count), {
        at: serverTimestamp(),
        streak,
        b1,
        b2,
        b3,
      });
    } catch {
      // Already claimed this window, or the battles do not hold up. Either way
      // there is nothing owed.
      return UNCLAIMED;
    }

    return payout(uid, count, streak);
  } catch {
    return UNCLAIMED;
  }
}

/**
 * Phase 2. Split out so an interrupted claim can be finished later: the receipt
 * is already committed and the rules will accept the matching payout.
 */
async function payout(
  uid: string,
  count: number,
  streak: number,
): Promise<ClaimResult> {
  const coins = bonusForStreak(streak);

  try {
    const receipt = await getDoc(bonusRef(uid, count));
    if (!receipt.exists()) return UNCLAIMED;

    const snap = await getDoc(userRef(uid));
    const cur = (snap.data() ?? {}) as Partial<UserDoc>;

    await updateDoc(userRef(uid), {
      coins: (cur.coins ?? 0) + coins,
      streak,
      bonusCount: count,
      // Must equal the receipt's stamp: the rules compare the two, and a fresh
      // serverTimestamp() here would be a different instant and be denied.
      lastBonusAt: receipt.data().at,
    });

    return { claimed: true, coins, streak };
  } catch {
    return UNCLAIMED;
  }
}

/**
 * Finish a bonus whose receipt landed but whose payout did not.
 *
 * Called alongside reconcileCredits: the same "resume what was interrupted"
 * duty the battle payout already has.
 */
export async function resumeDailyBonus(uid: string): Promise<ClaimResult> {
  try {
    const snap = await getDoc(userRef(uid));
    if (!snap.exists()) return UNCLAIMED;
    const me = snap.data() as Partial<UserDoc>;

    // A receipt one past the recorded count means phase 1 committed and phase 2
    // did not.
    const next = (me.bonusCount ?? 0) + 1;
    const receipt = await getDoc(bonusRef(uid, next));
    if (!receipt.exists()) return UNCLAIMED;

    return payout(uid, next, receipt.data().streak as number);
  } catch {
    return UNCLAIMED;
  }
}
