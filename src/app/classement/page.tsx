'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { BottomNav } from '@/components/ui/BottomNav';
import { Footer } from '@/components/ui/Footer';
import { Spinner } from '@/components/ui/Spinner';
import { Podium, RankRow } from '@/components/leaderboard/Podium';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { useAuth } from '@/lib/firebase/auth-context';
import { rankOf, topPlayers, type RankedPlayer } from '@/lib/firebase/leaderboard';

export default function LeaderboardPage() {
  const { user, profile } = useAuth();
  const [players, setPlayers] = useState<RankedPlayer[] | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void topPlayers(50).then((p) => {
      if (alive) setPlayers(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Only look up a global rank when the player is not already on the page.
  useEffect(() => {
    if (!user || !profile || !players) return;
    if (players.some((p) => p.uid === user.uid)) return;

    let alive = true;
    void rankOf(profile.humanWins ?? 0, profile.battlesPlayed ?? 0).then((r) => {
      if (alive) setMyRank(r);
    });
    return () => {
      alive = false;
    };
  }, [user, profile, players]);

  if (!isFirebaseConfigured) return <SetupNotice />;

  const onPage = players?.find((p) => p.uid === user?.uid) ?? null;
  const rest = players?.slice(3) ?? [];

  return (
    <>
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 p-5 pb-32">
      <PageHeader />

      <div>
        <h1 className="text-4xl font-black uppercase leading-none tracking-tighter">
          Top <span className="text-gold">Mondial</span>
        </h1>
        <p className="mt-2 text-sm text-ink-400">
          Classement par victoires, puis par nombre total de pompes.
        </p>
      </div>

      {players === null ? (
        <Spinner label="Chargement du classement…" />
      ) : players.length === 0 ? (
        <EmptyState
          title="Le classement est vide"
          body="Sois le premier à y entrer."
          action={{ href: '/matchmaking', label: 'Battle' }}
        />
      ) : (
        <>
          <section className="pt-2">
            <Podium players={players.slice(0, 3)} />
          </section>

          {rest.length > 0 && (
            <section className="stagger flex flex-col gap-2">
              {rest.map((p) => (
                <RankRow key={p.uid} player={p} isSelf={p.uid === user?.uid} />
              ))}
            </section>
          )}

          {/* The viewer, when they are outside the visible page. */}
          {user && !onPage && (
            <section>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-500">
                Ton classement
              </p>
              {profile && (profile.battlesPlayed ?? 0) > 0 ? (
                <RankRow
                  isSelf
                  player={{
                    uid: user.uid,
                    username: profile.username,
                    avatar: profile.avatar ?? null,
                    // The ranked figure, matching every other row.
                    wins: profile.humanWins ?? 0,
                    losses: profile.losses ?? 0,
                    totalReps: profile.totalReps ?? 0,
                    xp: profile.xp ?? 0,
                    rank: myRank ?? 0,
                  }}
                />
              ) : (
                <EmptyState title="Termine un battle pour entrer au classement." />
              )}
            </section>
          )}
        </>
      )}

      <Footer className="mt-2" />
    </main>

    <BottomNav />
    </>
  );
}
