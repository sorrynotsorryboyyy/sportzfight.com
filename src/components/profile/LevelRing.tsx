'use client';

import { levelProgress } from '@/lib/progression/level';
import { cn } from '@/lib/utils/cn';

/**
 * Level badge with the XP ring around it. The ring is the progress through the
 * CURRENT level, not lifetime XP — that is the number a player can actually act
 * on ("one more battle and I level up").
 */
export function LevelRing({
  xp,
  size = 96,
  className,
}: {
  xp: number;
  size?: number;
  className?: string;
}) {
  const { level, progress, xpToNext } = levelProgress(xp);
  const stroke = size >= 80 ? 7 : 5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div
      className={cn('relative grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
      title={`${xpToNext} XP avant le niveau ${level + 1}`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-ink-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className="text-volt-500 transition-[stroke-dashoffset] duration-500"
        />
      </svg>

      <div className="absolute flex flex-col items-center leading-none">
        <span className="text-[0.55rem] font-bold uppercase tracking-widest text-ink-500">
          Niv.
        </span>
        <span
          className="tnum font-black text-ink-100"
          style={{ fontSize: size * 0.32 }}
        >
          {level}
        </span>
      </div>
    </div>
  );
}

/** Horizontal XP bar with the numbers spelled out. */
export function XpBar({ xp }: { xp: number }) {
  const { level, xpIntoLevel, xpForLevel, xpToNext, progress } = levelProgress(xp);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="font-bold uppercase tracking-widest text-ink-400">
          Niveau {level}
        </span>
        <span className="tnum text-ink-500">
          {xpIntoLevel} / {xpForLevel} XP
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-volt-500 transition-[width] duration-500"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-ink-500">
        Encore <span className="tnum font-semibold text-ink-300">{xpToNext}</span>{' '}
        XP pour le niveau {level + 1}
      </p>
    </div>
  );
}
