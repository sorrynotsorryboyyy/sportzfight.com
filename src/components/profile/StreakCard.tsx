'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { claimDailyBonus, dailyStatus, type DailyStatus } from '@/lib/firebase/daily';
import { STREAK_3_COINS, STREAK_7_COINS } from '@/lib/progression/awards';
import { cn } from '@/lib/utils/cn';

/**
 * The daily streak, and the bonus it pays.
 *
 * This exists because a bonus nobody can see does not retain anyone. Winning a
 * battle pays 3 $SC; a seventh consecutive day pays 45. That ratio is the whole
 * design, and it only works if the player knows about it.
 */

/** Hours until a moment, rounded up, for a human-readable wait. */
function hoursUntil(when: Date): number {
  return Math.max(1, Math.ceil((when.getTime() - Date.now()) / 3_600_000));
}

/** Which milestone the next day reaches, if any. */
function milestone(next: number): string | null {
  if (next % 7 === 0) return `+${STREAK_7_COINS} $SC`;
  if (next % 3 === 0) return `+${STREAK_3_COINS} $SC`;
  return null;
}

export function StreakCard({ uid }: { uid: string }) {
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [justPaid, setJustPaid] = useState<number | null>(null);

  const refresh = useCallback(() => {
    void dailyStatus(uid).then(setStatus);
  }, [uid]);

  useEffect(refresh, [refresh]);

  const claim = async () => {
    setClaiming(true);
    const r = await claimDailyBonus(uid);
    setClaiming(false);
    if (r.claimed) setJustPaid(r.coins);
    refresh();
  };

  // A skeleton of the SAME height, not null: returning null made the card
  // appear after a Firestore read and shove the whole page down — the worst
  // layout shift in the app, on every visit to this page.
  if (!status) {
    return <Card className="h-44 animate-pulse" aria-hidden />;
  }

  const next = status.streak + 1;
  const tier = milestone(next);
  const pct = Math.round((status.progress / status.goal) * 100);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-3xs font-bold uppercase tracking-widest text-ink-500">
            Série en cours
          </p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="tnum text-3xl font-black leading-none text-volt-500">
              {status.streak}
            </span>
            <span className="text-sm text-ink-400">
              {status.streak === 1 ? 'jour' : 'jours'}
            </span>
          </p>
        </div>

        <span className="rounded-full bg-gold/10 px-2.5 py-1 text-xs font-black text-gold">
          +{status.reward} $SC
        </span>
      </div>

      {/* Today's objective. */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <p className="text-xs text-ink-400">
            Objectif du jour · {status.progress}/{status.goal} battles
          </p>
          {tier && (
            <p className="text-3xs font-bold uppercase tracking-widest text-gold">
              Palier {tier}
            </p>
          )}
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-850">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500',
              status.progress >= status.goal ? 'bg-volt-500' : 'bg-volt-500/50',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {justPaid !== null ? (
        <p className="mt-4 text-center text-sm font-bold text-volt-500">
          +{justPaid} $SC empochés. À demain.
        </p>
      ) : status.claimable ? (
        <Button size="md" className="mt-4" loading={claiming} onClick={claim}>
          Récupérer {status.reward} $SC
        </Button>
      ) : status.progress < status.goal ? (
        <p className="mt-4 text-center text-xs text-ink-500">
          Encore {status.goal - status.progress} battle
          {status.goal - status.progress > 1 ? 's' : ''} pour le bonus du jour.
        </p>
      ) : (
        <p className="mt-4 text-center text-xs text-ink-500">
          {status.nextAt
            ? `Prochain bonus dans ${hoursUntil(status.nextAt)} h.`
            : 'Bonus déjà récupéré.'}
        </p>
      )}
    </Card>
  );
}
