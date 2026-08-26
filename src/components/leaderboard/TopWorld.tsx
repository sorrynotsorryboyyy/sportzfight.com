'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Podium, RankRow } from '@/components/leaderboard/Podium';
import { useAuth } from '@/lib/firebase/auth-context';
import { rankOf, topPlayers, type RankedPlayer } from '@/lib/firebase/leaderboard';

/**
 * Podium of the top three, plus where the viewer stands.
 *
 * Shared by the landing page and the play hub: on the landing it is social
 * proof (real pseudos beat a promise), in the hub it is the thing you are
 * trying to climb. Same data, same component, so the two cannot drift.
 */
export function TopWorld({
  uid,
  /** The landing has no personal row to show — nobody is signed in. */
  showSelf = true,
}: {
  uid: string | null;
  showSelf?: boolean;
}) {
  const { profile } = useAuth();
  const [players, setPlayers] = useState<RankedPlayer[] | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void topPlayers(10).then((p) => {
      if (alive) setPlayers(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!showSelf || !uid || !profile || !players) return;
    if (players.some((p) => p.uid === uid)) return;
    let alive = true;
    void rankOf(profile.wins ?? 0, profile.battlesPlayed ?? 0).then((r) => {
      if (alive) setMyRank(r);
    });
    return () => {
      alive = false;
    };
  }, [uid, profile, players, showSelf]);

  const onPodium = players?.slice(0, 3).some((p) => p.uid === uid) ?? false;

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-ink-400">
          Top Mondial
        </h2>
        <Link
          href="/classement"
          className="focus-ring rounded px-1 text-xs font-semibold text-volt-500 hover:underline"
        >
          Classement →
        </Link>
      </div>

      {players === null ? (
        <Card className="h-28 animate-pulse bg-ink-900/40">
          <span className="sr-only">Chargement du classement…</span>
        </Card>
      ) : players.length === 0 ? (
        // An explicit empty state rather than rendering nothing: a section that
        // silently disappears reads as broken.
        <Card className="text-center">
          <p className="text-sm text-ink-300">
            Personne au classement pour l’instant.
          </p>
          <p className="mt-1 text-xs text-ink-500">
            Termine un battle et prends la première place.
          </p>
        </Card>
      ) : (
        <>
          <Podium players={players.slice(0, 3)} />

          {showSelf &&
            uid &&
            profile &&
            !onPodium &&
            (profile.battlesPlayed ?? 0) > 0 && (
              <div className="mt-4">
                <RankRow
                  isSelf
                  player={{
                    uid,
                    username: profile.username,
                    avatar: profile.avatar ?? null,
                    wins: profile.wins ?? 0,
                    losses: profile.losses ?? 0,
                    totalReps: profile.totalReps ?? 0,
                    xp: profile.xp ?? 0,
                    rank: players.find((p) => p.uid === uid)?.rank ?? myRank ?? 0,
                  }}
                />
              </div>
            )}
        </>
      )}
    </section>
  );
}
