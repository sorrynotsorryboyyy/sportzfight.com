'use client';

import { cn } from '@/lib/utils/cn';

/**
 * Tap-to-count pad and the +/- correction control.
 *
 * In manual mode the big pad is the primary input, so it fills the thumb zone
 * and gives haptic + visual confirmation. In camera mode only the small
 * correction row is shown, for fixing a miscount without stopping.
 */
export function ManualPad({
  onAdjust,
  variant,
  count,
  disabled = false,
}: {
  onAdjust: (delta: number) => void;
  variant: 'primary' | 'correction';
  count?: number;
  disabled?: boolean;
}) {
  if (variant === 'primary') {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={disabled}
          onPointerDown={(e) => {
            e.preventDefault();
            onAdjust(1);
          }}
          className={cn(
            'panel-sheen grid h-44 w-full place-items-center rounded-3xl border-2 border-volt-500/60 bg-volt-500/10',
            'text-volt-400 transition-transform active:scale-[0.98] active:bg-volt-500/20',
            'disabled:pointer-events-none disabled:opacity-40',
            'touch-manipulation select-none',
          )}
          aria-label="Compter une répétition"
        >
          <span className="text-center">
            <span className="tnum block text-7xl font-black leading-none">
              {count ?? 0}
            </span>
            <span className="mt-2 block text-xs font-bold uppercase tracking-widest">
              Appuie à chaque pompe
            </span>
          </span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onAdjust(-1)}
          className="h-11 rounded-xl border border-ink-700 text-sm font-semibold text-ink-400 transition-colors hover:text-ink-100 disabled:opacity-40"
        >
          Annuler la dernière (−1)
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">
        Corriger
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAdjust(-1)}
        className="size-12 rounded-xl border border-ink-700 text-xl font-black text-ink-300 transition-colors hover:border-flare-500 hover:text-flare-400 disabled:opacity-40"
        aria-label="Retirer une répétition"
      >
        −
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAdjust(1)}
        className="size-12 rounded-xl border border-ink-700 text-xl font-black text-ink-300 transition-colors hover:border-volt-500 hover:text-volt-400 disabled:opacity-40"
        aria-label="Ajouter une répétition"
      >
        +
      </button>
    </div>
  );
}
