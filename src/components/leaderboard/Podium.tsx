'use client';

import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { PlanBadge } from '@/components/profile/PlanBadge';
import { cn } from '@/lib/utils/cn';
import type { RankedPlayer } from '@/lib/firebase/leaderboard';

/** Gold / silver / bronze. Anything past third is plain. */
const MEDAL = [
  { ring: 'ring-gold', text: 'text-gold', glow: 'bg-gold/10', label: '1' },
  { ring: 'ring-ink-300', text: 'text-ink-300', glow: 'bg-ink-300/10', label: '2' },
  { ring: 'ring-[#cd7f32]', text: 'text-[#cd7f32]', glow: 'bg-[#cd7f32]/10', label: '3' },
] as const;

function medalFor(rank: number) {
  return rank >= 1 && rank <= 3 ? MEDAL[rank - 1] : null;
}

/**
 * The top three, arranged as an actual podium: second, first, third, with the
 * winner raised. Reads at a glance without needing to parse numbers.
 */
export function Podium({ players }: { players: RankedPlayer[] }) {
  if (!players.length) return null;

  const [first, second, third] = players;
  // Visual order puts the winner in the middle; skip empty slots gracefully.
  const slots = [
    { p: second, h: 'h-16', size: 52 },
    { p: first, h: 'h-24', size: 68 },
    { p: third, h: 'h-11', size: 46 },
  ].filter((s) => !!s.p);

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4">
      {slots.map(({ p, h, size }) => {
        const medal = medalFor(p!.rank)!;
        return (
          <div key={p!.uid} className="flex w-1/3 max-w-[8rem] flex-col items-center">
            <Avatar src={p!.avatar} name={p!.username} size={size} ring={medal.ring} />

            <p className="mt-2 w-full truncate text-center text-sm font-bold text-ink-100">
              {p!.username}
            </p>
            <p className="tnum text-xs text-ink-500">
              {p!.wins} V · {p!.totalReps} pompes
            </p>

            <div
              className={cn(
                'mt-2 grid w-full place-items-center rounded-t-xl border border-b-0 border-ink-800',
                medal.glow,
                h,
              )}
            >
              <span className={cn('text-2xl font-black', medal.text)}>
                {medal.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** One row of the ranked list, below the podium. */
export function RankRow({
  player,
  isSelf = false,
}: {
  player: RankedPlayer;
  isSelf?: boolean;
}) {
  const medal = medalFor(player.rank);

  return (
    <Card
      radius="md"
      padding="sm"
      sheen={false}
      className={cn(
        'flex items-center gap-3 transition-colors',
        isSelf
          ? 'border-volt-500/60 bg-volt-500/5'
          : 'hover:border-ink-700',
      )}
    >
      <span
        className={cn(
          'tnum w-7 shrink-0 text-center text-sm font-black',
          medal ? medal.text : 'text-ink-500',
        )}
      >
        {player.rank}
      </span>

      <Avatar src={player.avatar} name={player.username} size={32} />

      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-sm font-semibold text-ink-100">
          {player.username}
        </span>
        {/* A label, never an advantage: it says who supports the project and
            changes nothing about the ranking it sits in. */}
        <PlanBadge subscription={player.subscription} />
        {isSelf && (
          <span className="shrink-0 text-3xs font-bold uppercase tracking-widest text-volt-500">
            toi
          </span>
        )}
      </span>

      <span className="tnum shrink-0 text-right">
        <span className="block text-base font-black leading-none text-volt-500">
          {player.wins}
        </span>
        <span className="text-3xs uppercase tracking-widest text-ink-600">
          victoires
        </span>
      </span>

      <span className="tnum w-16 shrink-0 text-right">
        <span className="block text-base font-black leading-none text-ink-200">
          {player.totalReps}
        </span>
        <span className="text-3xs uppercase tracking-widest text-ink-600">
          pompes
        </span>
      </span>
    </Card>
  );
}
