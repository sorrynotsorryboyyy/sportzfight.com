'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { LevelRing } from '@/components/profile/LevelRing';
import { useAuth } from '@/lib/firebase/auth-context';

/**
 * The signed-in player's identity strip: level, pseudo, record and balance.
 *
 * Sits directly under the header so the header itself can stay uncluttered —
 * a pseudo button crammed next to "Quitter" was too tight to tap on a phone.
 * Renders nothing at all when signed out.
 */
export function PlayerBar() {
  const { user, profile } = useAuth();

  if (!user || !profile) return null;

  return (
    <Link href="/compte" className="focus-ring block rounded-2xl">
      <Card className="flex items-center gap-3 py-3 transition-colors hover:border-ink-700">
        <LevelRing xp={profile.xp ?? 0} size={52} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink-100">
            {profile.username}
          </p>
          <p className="tnum mt-0.5 text-xs text-ink-500">
            <span className="text-volt-500">{profile.wins ?? 0} V</span>
            <span className="mx-1.5 text-ink-700">·</span>
            <span className="text-flare-400">{profile.losses ?? 0} D</span>
            <span className="mx-1.5 text-ink-700">·</span>
            <span className="text-gold">{profile.coins ?? 0} $SC</span>
          </p>
        </div>

        <span aria-hidden className="shrink-0 pr-1 text-ink-600">
          →
        </span>
      </Card>
    </Link>
  );
}
