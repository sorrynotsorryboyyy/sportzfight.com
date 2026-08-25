'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { EXERCISES, type ExerciseSpec } from '@/lib/exercise/registry';

/**
 * The exercises you can queue for.
 *
 * Iterates EXERCISES directly rather than using availableExercises(): that
 * helper filters out the unreleased ones, which are exactly the ones we want on
 * screen. Showing them greyed out tells the player the product is going
 * somewhere, and the registry already declares them.
 */
function ModeCard({ spec }: { spec: ExerciseSpec }) {
  const inner = (
    <div
      className={cn(
        'panel-sheen relative flex h-full flex-col rounded-2xl border p-4 transition-colors',
        spec.available
          ? 'border-ink-700 bg-ink-900/70 hover:border-volt-500/60'
          : 'border-ink-850 bg-ink-900/30',
      )}
    >
      <span
        aria-hidden
        className={cn('text-3xl', !spec.available && 'opacity-40 grayscale')}
      >
        {spec.emoji}
      </span>

      <p
        className={cn(
          'mt-2 text-lg font-black uppercase leading-none tracking-tight',
          spec.available ? 'text-ink-100' : 'text-ink-500',
        )}
      >
        {spec.label}
      </p>

      <p
        className={cn(
          'mt-1.5 text-xs leading-snug',
          spec.available ? 'text-ink-400' : 'text-ink-600',
        )}
      >
        {spec.tagline}
      </p>

      {spec.available ? (
        <span className="mt-3 text-xs font-bold uppercase tracking-widest text-volt-500">
          Jouer →
        </span>
      ) : (
        <span className="mt-3 self-start rounded-full bg-ink-800 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-ink-500">
          Bientôt
        </span>
      )}
    </div>
  );

  if (!spec.available) {
    // No link and no aria-disabled: an <li> cannot carry that state. The
    // "Bientôt" badge inside is what tells a screen reader it is not playable.
    return <li className="cursor-not-allowed">{inner}</li>;
  }

  return (
    <li>
      <Link
        href={`/matchmaking?exercise=${spec.id}`}
        className="block h-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-glow"
      >
        {inner}
      </Link>
    </li>
  );
}

export function ModeGrid() {
  const modes = Object.values(EXERCISES);

  return (
    <section>
      <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-ink-400">
        Modes de jeu
      </h2>
      <ul className="grid grid-cols-2 gap-3">
        {modes.map((spec) => (
          <ModeCard key={spec.id} spec={spec} />
        ))}
      </ul>
    </section>
  );
}
