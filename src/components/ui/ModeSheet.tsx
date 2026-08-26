'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { availableExercises } from '@/lib/exercise/registry';
import { cn } from '@/lib/utils/cn';

/**
 * The mode picker behind the Battle button.
 *
 * The bottom bar used to send you straight to matchmaking, silently defaulting
 * to pushups without saying so — you found out which exercise you had signed up
 * for once the camera was already on. One extra tap buys an explicit choice.
 *
 * Driven by `availableExercises()`, so an exercise appears here the moment its
 * detector ships and never before.
 */
export function ModeSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const modes = availableExercises();

  // Escape closes, and focus moves into the sheet so a keyboard user is not
  // left behind on the button that opened it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pick = (id: string) => {
    onClose();
    router.push(`/matchmaking?exercise=${id}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal
        aria-label="Choisis ton mode"
        className="relative w-full max-w-lg animate-rise rounded-t-3xl border border-ink-800 bg-ink-900 p-5 shadow-lg shadow-ink-950"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-700" />

        <p className="text-3xs font-bold uppercase tracking-widest text-ink-500">
          Choisis ton mode
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m.id)}
              className={cn(
                'panel-sheen focus-ring flex flex-col items-center gap-1.5 rounded-2xl border border-ink-700 bg-ink-850 p-4',
                'transition-colors hover:border-volt-500/60 active:scale-[0.98]',
              )}
            >
              <span aria-hidden className="text-3xl">
                {m.emoji}
              </span>
              <span className="text-sm font-black uppercase tracking-tight text-ink-100">
                {m.label}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-3 text-center text-3xs text-ink-600">
          60 secondes · adversaire trouvé automatiquement
        </p>
      </div>
    </div>
  );
}
