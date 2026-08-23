'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * The opponent's half of the split screen.
 *
 * Deliberately not their video. Pose detection runs entirely on-device and the
 * only thing that crosses the network is the rep count, so there is no stream
 * to show — and adding one would mean WebRTC plus TURN servers plus sending
 * people's camera feeds through the network, which V1 promises not to do.
 * What matters mid-effort is the number you have to beat, so that is what
 * dominates the panel.
 */
export function OpponentPanel({
  name,
  avatar,
  score,
  connected,
  exerciseLabel,
  waiting = false,
}: {
  name: string;
  avatar: string | null;
  score: number;
  connected: boolean;
  exerciseLabel: string;
  waiting?: boolean;
}) {
  const [popping, setPopping] = useState(false);
  const prevRef = useRef(score);

  useEffect(() => {
    const rose = score > prevRef.current;
    prevRef.current = score;
    if (!rose) return;
    setPopping(true);
    const t = setTimeout(() => setPopping(false), 280);
    return () => clearTimeout(t);
  }, [score]);

  return (
    <div className="relative flex size-full flex-col items-center justify-center gap-3 overflow-hidden bg-ink-900 p-4">
      {/* A faint red wash so the two halves read as opposing corners. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-flare-500/10 to-transparent"
      />

      <div className="relative flex items-center gap-2">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt=""
            referrerPolicy="no-referrer"
            className="size-8 rounded-full border border-ink-700 object-cover"
          />
        ) : (
          <span className="grid size-8 place-items-center rounded-full border border-ink-700 bg-ink-800 text-xs font-bold text-ink-400">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="max-w-[9rem] truncate text-sm font-bold text-ink-100">
            {name}
          </p>
          <p className="flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-widest text-ink-500">
            <span
              className={cn(
                'size-1.5 rounded-full',
                connected ? 'bg-volt-500' : 'bg-flare-500',
              )}
            />
            {connected ? 'En ligne' : 'Déconnecté'}
          </p>
        </div>
      </div>

      <span
        className={cn(
          'tnum relative text-7xl font-black leading-none text-flare-400 sm:text-8xl',
          popping && 'animate-pop',
        )}
      >
        {waiting ? '—' : score}
      </span>

      <p className="relative text-[0.65rem] font-bold uppercase tracking-widest text-ink-500">
        {exerciseLabel}
      </p>

      {!connected && !waiting && (
        <p className="relative mt-1 rounded-full bg-ink-800 px-3 py-1 text-xs text-ink-400">
          Connexion perdue…
        </p>
      )}
    </div>
  );
}
