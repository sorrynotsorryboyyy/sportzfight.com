'use client';

import { reportSilent } from '@/lib/monitoring/sentry';
import type { Subscription } from '@/lib/subscription';
import {
  collection,
  getCountFromServer,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from './client';
import type { UserDoc } from '@/lib/battle/types';

/**
 * Global ranking, read straight off the users collection.
 *
 * This is the query that made removing `email` from users/{uid} mandatory: a
 * leaderboard is a LIST over the whole collection, so every field on those
 * documents is readable by any signed-in client. Nothing personal may live
 * there. See the users rules and users/{uid}/private/contact.
 */

export interface RankedPlayer {
  uid: string;
  username: string;
  avatar: string | null;
  wins: number;
  losses: number;
  totalReps: number;
  xp: number;
  /** 1-based position within the returned page. */
  rank: number;
  /** Paid plan, for the badge. Never affects ordering. */
  subscription?: Subscription;
}

const toRanked = (
  id: string,
  d: UserDoc,
  rank: number,
): RankedPlayer => ({
  uid: id,
  username: d.username,
  avatar: d.avatar ?? null,
  wins: d.wins ?? 0,
  losses: d.losses ?? 0,
  totalReps: d.totalReps ?? 0,
  xp: d.xp ?? 0,
  rank,
  subscription: d.subscription,
});

/**
 * Top players by wins, then total pushups as the tiebreak.
 */
export async function topPlayers(max = 50): Promise<RankedPlayer[]> {
  try {
    // Ordered by wins then reps, with NO inequality filter. Firestore forces an
    // inequality field to lead the ordering, so `where(battlesPlayed > 0)`
    // would rank by battles played rather than by wins — the wrong board.
    // Accounts that never played are dropped client-side instead; they sort to
    // the bottom anyway, so the page is not polluted.
    const snap = await getDocs(
      query(
        collection(db(), 'users'),
        orderBy('wins', 'desc'),
        orderBy('totalReps', 'desc'),
        fbLimit(max),
      ),
    );

    return snap.docs
      .map((d) => ({ id: d.id, data: d.data() as UserDoc }))
      .filter((r) => (r.data.battlesPlayed ?? 0) > 0)
      .map((r, i) => toRanked(r.id, r.data, i + 1));
  } catch (e) {
    reportSilent(e, 'leaderboard');
    // Missing index or offline: the UI treats this as an empty board rather
    // than an error, because a leaderboard is never load-bearing.
    return [];
  }
}

/**
 * Where this player sits globally, when they are outside the visible page.
 * Counts everyone strictly ahead of them, which is one aggregation query
 * rather than a full scan.
 */
export async function rankOf(
  wins: number,
  battlesPlayed: number,
): Promise<number | null> {
  if (battlesPlayed <= 0) return null;
  try {
    const ahead = await getCountFromServer(
      query(
        collection(db(), 'users'),
        where('wins', '>', wins),
      ),
    );
    return ahead.data().count + 1;
  } catch {
    return null;
  }
}
