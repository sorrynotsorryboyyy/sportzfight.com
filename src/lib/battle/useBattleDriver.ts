'use client';

import { useEffect, useRef } from 'react';
import { useLatest } from '@/lib/utils/useLatest';
import {
  finishBattle,
  heartbeat,
  startBattle,
} from '@/lib/firebase/battles';
import { serverNow } from '@/lib/firebase/clock';
import { HEARTBEAT_MS, FINAL_LATCH_TIMEOUT_MS } from './constants';
import { bothFinal, canStart, deriveWinner, isStale, slotOf } from './machine';
import { creditBattle } from '@/lib/firebase/stats';
import type { BattleWithId } from './types';
import type { Phase } from './machine';

/**
 * The side-effecting half of the battle: heartbeats, arming, and finalizing.
 *
 * Kept apart from rendering so the presentation stays a pure function of the
 * document. Every write here is also guarded by the security rules, so a
 * duplicate or ill-timed attempt is refused by the backend rather than
 * corrupting the battle.
 */
export function useBattleDriver(
  battle: BattleWithId | null,
  uid: string | null,
  phase: Phase,
): void {
  const slot = battle && uid ? slotOf(battle, uid) : null;
  // The finalize timer fires later and must act on the current document.
  const battleRef = useLatest(battle);
  const startAttemptedRef = useRef(false);
  const finishAttemptedRef = useRef(false);
  const endingSinceRef = useRef<number | null>(null);
  const creditedRef = useRef<string | null>(null);

  // ---- heartbeat ----
  // Presence is what lets the other side detect an abandoned battle, and what
  // authorises player2 to take over arming if player1 vanishes.
  useEffect(() => {
    if (!battle || !slot) return;
    if (!['waiting', 'ready', 'live'].includes(battle.status)) return;

    const id = battle.id;
    void heartbeat(id, slot);
    const t = setInterval(() => void heartbeat(id, slot), HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void heartbeat(id, slot);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // Deliberately keyed on id/status/slot rather than the whole document:
    // the doc changes on every score write, which would restart the interval
    // several times a second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle?.id, battle?.status, slot]);

  // ---- arming ----
  // Only player1 normally writes startedAt. Player2 takes over only once
  // player1's server-stamped heartbeat has gone stale; the rules enforce that
  // window independently, so this is a UX shortcut, not the security boundary.
  useEffect(() => {
    if (!battle || !slot) return;
    if (startAttemptedRef.current) return;
    if (!canStart(battle)) return;

    const iAmStarter =
      slot === 1 || (slot === 2 && isStale(battle, 1, serverNow()));
    if (!iAmStarter) return;

    startAttemptedRef.current = true;
    void startBattle(battle.id).then((won) => {
      // If we lost the race the snapshot will carry the winner's startedAt;
      // allow a later retry only if nothing actually started.
      if (!won) startAttemptedRef.current = false;
    });
  }, [battle, slot]);

  // Reset the latch if the battle is re-armed (e.g. a cancelled rematch).
  useEffect(() => {
    if (battle?.startedAt) startAttemptedRef.current = true;
  }, [battle?.startedAt]);

  // ---- finalizing ----
  // Once past the hard end, whoever is present writes the result. The winner
  // is derived from the stored scores and re-verified by the rules, so a
  // client cannot name itself the winner and it does not matter who writes.
  useEffect(() => {
    if (!battle || phase !== 'ending') return;
    if (finishAttemptedRef.current) return;

    endingSinceRef.current ??= Date.now();

    const attempt = () => {
      const b = battleRef.current;
      if (!b || finishAttemptedRef.current) return;

      finishAttemptedRef.current = true;
      const winner = deriveWinner(b);
      const someoneLeft =
        isStale(b, 1, serverNow()) || isStale(b, 2, serverNow());

      void finishBattle(b.id, winner, someoneLeft ? 'forfeit' : 'time').then(
        (ok) => {
          if (!ok) finishAttemptedRef.current = false;
        },
      );
    };

    // Give both sides a moment to land their final flush, so the result is
    // computed from complete scores rather than a truncated one. Once both
    // have latched we can finalize immediately; otherwise we wait out the
    // timeout with a real timer (a ref alone would never re-trigger this).
    if (bothFinal(battle)) {
      attempt();
      return;
    }

    const waited = Date.now() - endingSinceRef.current;
    const remaining = Math.max(0, FINAL_LATCH_TIMEOUT_MS - waited);
    const t = setTimeout(attempt, remaining);
    return () => clearTimeout(t);
  }, [battle, phase, battleRef]);

  // A re-entered battle that is already finished needs no further writes.
  useEffect(() => {
    if (battle?.status === 'finished') finishAttemptedRef.current = true;
  }, [battle?.status]);

  // ---- progression ----
  // Credit XP and coins once the result is committed. Each client credits only
  // itself. Safe to fire on re-entry: the receipt document makes a second
  // attempt a no-op rather than a double payout.
  useEffect(() => {
    if (!battle || !uid || battle.status !== 'finished') return;
    if (creditedRef.current === battle.id) return;
    if (!slot) return; // spectators earn nothing

    creditedRef.current = battle.id;
    void creditBattle(uid, battle.id, battle).catch(() => {
      // A denial here means the rules refused the claim, which is the system
      // working. Nothing to retry inline; /compte resumes a stuck claim.
    });
  }, [battle, uid, slot]);
}
