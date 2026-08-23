'use client';

import { cn } from '@/lib/utils/cn';

/**
 * The countdown clock. Readable at arm's length, upside down, mid-effort:
 * oversized tabular digits plus a progress ring that carries the same
 * information without needing to be read.
 */
export function BattleTimer({
  secondsLeft,
  progress,
  approximate = false,
}: {
  secondsLeft: number;
  progress: number;
  approximate?: boolean;
}) {
  const urgent = secondsLeft <= 10;
  const size = 168;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        aria-hidden
      >
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
          strokeDashoffset={circumference * Math.min(1, Math.max(0, progress))}
          className={cn(
            'transition-[stroke-dashoffset] duration-200 ease-linear',
            urgent ? 'text-flare-500' : 'text-volt-500',
          )}
        />
      </svg>

      <div className="absolute flex flex-col items-center">
        <span
          className={cn(
            'tnum text-6xl font-black leading-none',
            urgent ? 'text-flare-400' : 'text-ink-100',
          )}
          aria-live="off"
        >
          {secondsLeft}
        </span>
        <span className="mt-1 text-[0.65rem] font-bold uppercase tracking-widest text-ink-500">
          {approximate ? 'sec ~' : 'sec'}
        </span>
      </div>
    </div>
  );
}
