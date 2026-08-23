'use client';

import { useEffect, useRef, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { subscribeBattle } from '@/lib/firebase/battles';
import { observeWriteEcho } from '@/lib/firebase/clock';
import type { BattleWithId } from './types';

interface BattleState {
  battle: BattleWithId | null;
  loading: boolean;
  error: Error | null;
  /** True while we are reading a cached copy rather than the server's. */
  stale: boolean;
}

/**
 * Live subscription to a battle document.
 *
 * Also opportunistically measures the server clock offset: when `startedAt`
 * resolves from a pending local write to a real Timestamp, the two local
 * instants bracket the commit, which is the cheapest and most accurate offset
 * sample available (see lib/firebase/clock.ts).
 */
export function useBattle(id: string | null): BattleState {
  const [state, setState] = useState<BattleState>({
    battle: null,
    loading: true,
    error: null,
    stale: false,
  });

  // Local instant at which we first saw an unresolved startedAt.
  const pendingStartRef = useRef<number | null>(null);
  const echoDoneRef = useRef(false);

  useEffect(() => {
    if (!id) return;

    pendingStartRef.current = null;
    echoDoneRef.current = false;

    const unsub = subscribeBattle(
      id,
      (battle, fromCache) => {
        if (battle && !echoDoneRef.current) {
          const started = battle.startedAt;
          if (!started && battle.status === 'live') {
            // Our own write is in flight; the sentinel reads as null locally.
            pendingStartRef.current ??= Date.now();
          } else if (started instanceof Timestamp && pendingStartRef.current) {
            observeWriteEcho(started, pendingStartRef.current, Date.now());
            echoDoneRef.current = true;
          }
        }
        setState({ battle, loading: false, error: null, stale: fromCache });
      },
      (error) => setState((s) => ({ ...s, loading: false, error })),
    );

    return unsub;
  }, [id]);

  // With no id there is nothing to load; report that directly rather than
  // round-tripping through an effect and an extra render.
  if (!id) return { battle: null, loading: false, error: null, stale: false };

  return state;
}
