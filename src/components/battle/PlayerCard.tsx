'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * One athlete's live score panel.
 *
 * The number is the whole point of this screen, so it dominates: huge, tabular
 * (so it never reflows as digits change), and it pops on each new rep so a
 * glance from the floor is enough to read progress.
 */
export function PlayerCard({
  name,
  score,
  isSelf,
  slot,
  ready,
  connected = true,
  compact = false,
}: {
  name: string;
  score: number;
  isSelf: boolean;
  slot: 1 | 2;
  ready?: boolean;
  connected?: boolean;
  compact?: boolean;
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

  const accent = slot === 1 ? 'text-volt-500' : 'text-flare-400';
  const border = slot === 1 ? 'border-volt-500/35' : 'border-flare-500/35';

  return (
    <div
      className={cn(
        'panel-sheen flex flex-1 flex-col items-center rounded-2xl border bg-ink-900/70',
        compact ? 'gap-1 px-3 py-4' : 'gap-2 px-4 py-6',
        border,
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'size-1.5 rounded-full',
            connected ? 'bg-volt-500' : 'bg-ink-600',
          )}
          aria-label={connected ? 'Connecté' : 'Déconnecté'}
        />
        <span className="max-w-[8rem] truncate text-sm font-semibold text-ink-300">
          {name}
        </span>
      </div>

      {isSelf && (
        <span className="text-[0.6rem] font-bold uppercase tracking-widest text-ink-500">
          Toi
        </span>
      )}

      <span
        className={cn(
          'tnum font-black leading-none',
          compact ? 'text-5xl' : 'text-7xl',
          accent,
          popping && 'animate-pop',
        )}
      >
        {score}
      </span>

      {ready !== undefined && (
        <span
          className={cn(
            'mt-1 rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest',
            ready ? 'bg-volt-500/15 text-volt-400' : 'bg-ink-800 text-ink-500',
          )}
        >
          {ready ? 'Prêt' : 'En attente'}
        </span>
      )}
    </div>
  );
}
