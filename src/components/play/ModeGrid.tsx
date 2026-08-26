'use client';

import Link from 'next/link';
import { availableExercises } from '@/lib/exercise/registry';
import type { ExerciseSpec } from '@/lib/exercise/registry';

/**
 * The exercises you can queue for.
 *
 * Only shipped ones. This used to render the whole registry so unreleased
 * exercises appeared greyed out under a "Bientôt" badge — five cards of which
 * three did nothing. Two real choices, given room to breathe, read as a
 * finished product; five with three disabled read as a building site.
 *
 * Driven by `availableExercises()`, so a mode appears here the day its detector
 * ships and never before.
 */
function ModeCard({ spec }: { spec: ExerciseSpec }) {
  return (
    <li>
      <Link
        href={`/matchmaking?exercise=${spec.id}`}
        className="focus-ring panel-sheen group flex h-full flex-col rounded-2xl border border-ink-700 bg-ink-900/80 p-5 transition-colors hover:border-volt-500/60"
      >
        <span aria-hidden className="text-4xl">
          {spec.emoji}
        </span>

        <p className="mt-3 text-xl font-black uppercase leading-none tracking-tight text-ink-100">
          {spec.label}
        </p>
        <p className="mt-2 text-2xs leading-snug text-ink-400">{spec.tagline}</p>

        <span className="mt-4 text-3xs font-bold uppercase tracking-widest text-volt-500 transition-transform group-hover:translate-x-0.5">
          Battle →
        </span>
      </Link>
    </li>
  );
}

export function ModeGrid() {
  const modes = availableExercises();

  return (
    <section>
      <h2 className="mb-3 text-3xs font-bold uppercase tracking-widest text-ink-400">
        Modes de jeu
      </h2>
      <ul className="stagger grid grid-cols-2 gap-3">
        {modes.map((spec) => (
          <ModeCard key={spec.id} spec={spec} />
        ))}
      </ul>
    </section>
  );
}
