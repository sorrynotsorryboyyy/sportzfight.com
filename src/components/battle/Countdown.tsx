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
      /*
       * 45%, not the 92% this shipped with, and no backdrop blur.
       *
       * The countdown is the exact moment the athlete wants to check their
       * framing — am I fully in shot, am I far enough back — and a near-opaque
       * scrim made that impossible: the camera went dark for three seconds and
       * came back just as the effort started, too late to move. Blurring it
       * defeats the same purpose, and costs the most on a mid-range phone in
       * the frame right before the effort.
       *
       * Legibility is bought back by the vignette below rather than by the
       * scrim, so the FRAME EDGES stay readable while the CENTRE darkens.
       */
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/45"
      role="status"
      aria-live="assertive"
      aria-label={showGo ? 'Go !' : `Départ dans ${digit}`}
    >
      <div aria-hidden className="countdown-vignette pointer-events-none absolute inset-0" />

      <span
        key={showGo ? 'go' : digit}
        // drop-shadow rather than text-shadow: it follows the glyph outline,
        // so the black-weight numerals keep a clean edge instead of a halo.
        style={{ filter: 'drop-shadow(0 2px 12px rgb(7 9 12 / 0.9))' }}
        className={
          showGo
            ? 'relative animate-count-in text-8xl font-black uppercase tracking-tighter text-volt-500 sm:text-9xl'
            : 'tnum relative animate-count-in text-[10rem] font-black leading-none text-ink-100 sm:text-[14rem]'
        }
      >
        {showGo ? 'GO !' : digit}
      </span>
    </div>
  );
}
