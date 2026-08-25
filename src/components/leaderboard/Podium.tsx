'use client';

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

function Avatar({
  src,
  name,
  size,
  ring,
}: {
  src: string | null;
  name: string;
  size: number;
  ring?: string;
}) {
  const cls = cn(
    'rounded-full object-cover',
    ring && `ring-2 ${ring} ring-offset-2 ring-offset-ink-950`,
  );
  if (src) {
    return (
      // Google avatar URLs are remote and unoptimisable by next/image without
      // configuring the host; a 32-68px circle is not worth that.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        width={size}
        height={size}
        className={cls}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn(cls, 'grid place-items-center bg-ink-800 font-black text-ink-400')}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
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
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5',
        isSelf
          ? 'border-volt-500/60 bg-volt-500/5'
          : 'border-ink-800 bg-ink-900/60',
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

      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-100">
        {player.username}
        {isSelf && (
          <span className="ml-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-volt-500">
            toi
          </span>
        )}
      </span>

      <span className="tnum shrink-0 text-right">
        <span className="block text-base font-black leading-none text-volt-500">
          {player.wins}
        </span>
        <span className="text-[0.6rem] uppercase tracking-widest text-ink-600">
          victoires
        </span>
      </span>

      <span className="tnum w-16 shrink-0 text-right">
        <span className="block text-base font-black leading-none text-ink-200">
          {player.totalReps}
        </span>
        <span className="text-[0.6rem] uppercase tracking-widest text-ink-600">
          pompes
        </span>
      </span>
    </div>
  );
}
