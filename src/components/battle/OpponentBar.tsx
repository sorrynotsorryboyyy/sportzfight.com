'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * The opponent, reduced to a slim bar that floats over your camera.
 *
 * Deliberately not their video. Pose detection runs entirely on-device and the
 * only thing that crosses the network is the rep count, so there is no stream
 * to show — and adding one would mean WebRTC plus TURN servers plus sending
 * people's camera feeds off-device, which this app promises not to do.
 *
 * Their score comes from Firestore and therefore lags yours by up to one flush
 * (~1.5s). That is fine here: it is a reference point, not a live readout, and
 * it is styled clearly secondary to your own number.
 *
 * With `score` omitted the bar is in pre-battle mode and shows readiness
 * instead — the same component covers both phases so they cannot drift apart.
 */
export function OpponentBar({
  name,
  avatar,
  score,
  connected,
  ready,
  waiting = false,
  className,
}: {
  name: string;
  avatar: string | null;
  /** Omit before the battle starts; present during the effort. */
  score?: number;
  connected: boolean;
  ready?: boolean;
  waiting?: boolean;
  className?: string;
}) {
  const [popping, setPopping] = useState(false);
  const prevRef = useRef(score ?? 0);

  useEffect(() => {
    if (score === undefined) return;
    const rose = score > prevRef.current;
    prevRef.current = score;
    if (!rose) return;
    setPopping(true);
    const t = setTimeout(() => setPopping(false), 280);
    return () => clearTimeout(t);
  }, [score]);

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-xl border border-flare-500/25 bg-ink-950/75 px-3 py-2 backdrop-blur',
        className,
      )}
    >
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt=""
          referrerPolicy="no-referrer"
          className="size-7 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink-800 text-[0.65rem] font-bold text-ink-400">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold leading-tight text-ink-200">
          {name}
        </p>
        <p className="flex items-center gap-1 text-[0.6rem] font-semibold uppercase tracking-widest text-ink-500">
          <span
            className={cn(
              'size-1.5 rounded-full',
              waiting
                ? 'bg-ink-600'
                : connected
                  ? 'bg-volt-500'
                  : 'bg-flare-500',
            )}
          />
          {waiting
            ? 'En attente'
            : score === undefined
              ? ready
                ? 'Prêt'
                : 'Pas encore prêt'
              : connected
                ? 'Adversaire'
                : 'Déconnecté'}
        </p>
      </div>

      {score !== undefined && (
        <span
          className={cn(
            'tnum shrink-0 text-3xl font-black leading-none text-flare-400',
            popping && 'animate-pop',
          )}
        >
          {waiting ? '—' : score}
        </span>
      )}

      {score === undefined && ready && (
        <span className="shrink-0 rounded-full bg-volt-500/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-volt-400">
          Prêt
        </span>
      )}
    </div>
  );
}
