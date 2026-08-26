'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { BottomNav } from '@/components/ui/BottomNav';
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
    void rankOf(profile.wins ?? 0, profile.battlesPlayed ?? 0).then((r) => {
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
      <header className="flex items-center justify-between py-1">
        <Link href="/">
          <Logo className="text-xl" />
        </Link>
        <Link
          href="/compte"
          className="text-sm text-ink-400 transition-colors hover:text-ink-100"
        >
          Mon compte
        </Link>
      </header>

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
        <Card className="text-center">
          <p className="text-sm text-ink-300">
            Personne n’a encore terminé de battle.
          </p>
          <p className="mt-1 text-xs text-ink-500">
            Sois le premier à entrer dans le classement.
          </p>
          <Link href="/matchmaking" className="mt-4 block">
            <Button size="md">Lancer un battle</Button>
          </Link>
        </Card>
      ) : (
        <>
          <section className="pt-2">
            <Podium players={players.slice(0, 3)} />
          </section>

          {rest.length > 0 && (
            <section className="flex flex-col gap-2">
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
                    wins: profile.wins ?? 0,
                    losses: profile.losses ?? 0,
                    totalReps: profile.totalReps ?? 0,
                    xp: profile.xp ?? 0,
                    rank: myRank ?? 0,
                  }}
                />
              ) : (
                <Card className="text-center text-sm text-ink-400">
                  Termine un battle pour entrer au classement.
                </Card>
              )}
            </section>
          )}
        </>
      )}

    </main>

    <BottomNav />
    </>
  );
}
