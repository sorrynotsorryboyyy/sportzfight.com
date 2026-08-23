'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import type { BattleWithId } from '@/lib/battle/types';

/**
 * The payoff screen. Big, unambiguous, and shareable.
 */
export function ResultScreen({
  battle,
  uid,
  p1Name,
  p2Name,
}: {
  battle: BattleWithId;
  uid: string | null;
  p1Name: string;
  p2Name: string;
}) {
  const draw = battle.winner === 'draw';
  const iWon = !!uid && battle.winner === uid;
  const iPlayed = uid === battle.player1 || uid === battle.player2;
  const winnerName =
    battle.winner === battle.player1
      ? p1Name
      : battle.winner === battle.player2
        ? p2Name
        : null;

  const headline = draw
    ? 'ÉGALITÉ'
    : iPlayed
      ? iWon
        ? 'VICTOIRE'
        : 'DÉFAITE'
      : `${winnerName} GAGNE`;

  const headlineColour = draw
    ? 'text-gold'
    : iPlayed
      ? iWon
        ? 'text-volt-500'
        : 'text-flare-400'
      : 'text-volt-500';

  const rows: Array<{ name: string; score: number; won: boolean; slot: 1 | 2 }> = [
    {
      name: p1Name,
      score: battle.player1Score,
      won: battle.winner === battle.player1,
      slot: 1,
    },
    {
      name: p2Name,
      score: battle.player2Score,
      won: battle.winner === battle.player2,
      slot: 2,
    },
  ];

  return (
    <div className="flex flex-1 flex-col justify-center gap-8 py-6">
      <div className="animate-rise text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-ink-500">
          Battle terminé
        </p>
        <h1
          className={cn(
            'mt-2 text-6xl font-black uppercase leading-none tracking-tighter sm:text-7xl',
            headlineColour,
          )}
        >
          {headline}
        </h1>
        {battle.endReason === 'forfeit' && (
          <p className="mt-3 text-sm text-ink-400">
            Un joueur a quitté le battle.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div
            key={r.slot}
            className={cn(
              'panel-sheen flex items-center justify-between rounded-2xl border px-5 py-5',
              r.won
                ? 'border-volt-500/60 bg-volt-500/5'
                : 'border-ink-800 bg-ink-900/60',
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              {r.won && !draw && (
                <span className="text-2xl" aria-label="Gagnant">
                  🏆
                </span>
              )}
              <span className="truncate text-lg font-bold text-ink-100">
                {r.name}
              </span>
            </div>
            <div className="flex shrink-0 items-baseline gap-1.5">
              <span
                className={cn(
                  'tnum text-5xl font-black leading-none',
                  r.slot === 1 ? 'text-volt-500' : 'text-flare-400',
                )}
              >
                {r.score}
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-ink-500">
                reps
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Link href="/battle/create" className="block">
          <Button size="xl">REVANCHE</Button>
        </Link>
        <Link href="/" className="block">
          <Button size="lg" variant="ghost">
            Retour à l’accueil
          </Button>
        </Link>
      </div>
    </div>
  );
}
