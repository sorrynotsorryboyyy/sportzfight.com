'use client';

import { useEffect, useRef } from 'react';

/**
 * The 3-2-1-GO overlay.
 *
 * Both clients derive `digit` from the same server-written startedAt, so the
 * transitions land simultaneously without either side signalling the other.
 * A short vibration on each beat gives a cue the athlete can feel while
 * already in position, looking at the floor rather than the screen.
 */
export function Countdown({ digit }: { digit: number | null }) {
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    if (digit === lastRef.current) return;
    lastRef.current = digit;

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(digit === null ? [90, 40, 90] : 45);
      } catch {
        /* vibration unsupported or blocked */
      }
    }
  }, [digit]);

  const showGo = digit === null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/92 backdrop-blur-sm"
      role="status"
      aria-live="assertive"
      aria-label={showGo ? 'Go !' : `Départ dans ${digit}`}
    >
      <span
        key={showGo ? 'go' : digit}
        className={
          showGo
            ? 'animate-count-in text-8xl font-black uppercase tracking-tighter text-volt-500 sm:text-9xl'
            : 'tnum animate-count-in text-[10rem] font-black leading-none text-ink-100 sm:text-[14rem]'
        }
      >
        {showGo ? 'GO !' : digit}
      </span>
    </div>
  );
}
