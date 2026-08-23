'use client';

import { useEffect, useState } from 'react';
import { useLatest } from '@/lib/utils/useLatest';
import { clockState, freezeClock, serverNow } from '@/lib/firebase/clock';
import { deriveView, type BattleView } from './machine';
import type { BattleWithId } from './types';

/**
 * Ticks the derived battle view.
 *
 * The countdown must not stutter, so:
 * - the clock offset is frozen the moment the battle goes live;
 * - we tick on requestAnimationFrame rather than setInterval, which keeps the
 *   displayed second aligned to the real deadline instead of drifting by the
 *   accumulated timer error.
 *
 * Both clients run this same derivation over the same server-written
 * `startedAt`, which is what makes "GO" land simultaneously without either
 * side sending the other a message.
 */
export function useBattleClock(battle: BattleWithId | null): BattleView & {
  clockDegraded: boolean;
} {
  const [view, setView] = useState<BattleView>(() =>
    battle
      ? deriveView(battle, serverNow())
      : {
          phase: 'waiting',
          countdownDigit: null,
          secondsLeft: 0,
          progress: 0,
          msLeft: 0,
        },
  );

  // The rAF ticker reads the newest document without restarting each render.
  const battleRef = useLatest(battle);

  // Freeze the offset once, at the transition into live, so an offset update
  // landing mid-battle cannot make the timer jump.
  useEffect(() => {
    if (battle?.status === 'live' && battle.startedAt) freezeClock();
  }, [battle?.status, battle?.startedAt]);

  useEffect(() => {
    if (!battle) return;

    let raf = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const b = battleRef.current;
      if (b) setView(deriveView(b, serverNow()));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [battle, battleRef]);

  return { ...view, clockDegraded: clockState().degraded };
}
