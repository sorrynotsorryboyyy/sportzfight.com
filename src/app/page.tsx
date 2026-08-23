'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { FloatingCta } from '@/components/ui/FloatingCta';
import { Logo } from '@/components/ui/Logo';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { Podium, RankRow } from '@/components/leaderboard/Podium';
import { PlayerBar } from '@/components/profile/PlayerBar';
import { useAuth } from '@/lib/firebase/auth-context';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { rankOf, topPlayers, type RankedPlayer } from '@/lib/firebase/leaderboard';

/** Podium of the top three, plus where the viewer stands. */
function TopWorld({ uid }: { uid: string | null }) {
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
    if (!uid || !profile || !players) return;
    if (players.some((p) => p.uid === uid)) return;
    let alive = true;
    void rankOf(profile.wins ?? 0, profile.battlesPlayed ?? 0).then((r) => {
      if (alive) setMyRank(r);
    });
    return () => {
      alive = false;
    };
  }, [uid, profile, players]);

  const onPodium = players?.slice(0, 3).some((p) => p.uid === uid) ?? false;

  return (
    <section className="mt-12">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-ink-400">
          Top Mondial
        </h2>
        <Link
          href="/classement"
          className="text-xs font-semibold text-volt-500 hover:underline"
        >
          Tout voir →
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

          {uid && profile && !onPodium && (profile.battlesPlayed ?? 0) > 0 && (
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

export default function Home() {
  const { user, loading, signOut } = useAuth();

  if (!isFirebaseConfigured) return <SetupNotice />;

  const authed = !!user;

  return (
    <>
      {/* pb-28 keeps the floating CTA from covering the footer. */}
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col p-6 pb-28">
        <header className="flex items-center justify-between py-2">
          <Logo className="text-xl" />
          {!loading &&
            (authed ? (
              <button
                onClick={() => void signOut()}
                className="text-sm text-ink-400 transition-colors hover:text-ink-100"
              >
                Déconnexion
              </button>
            ) : (
              <Link
                href="/login"
                className="text-sm font-semibold text-volt-500 hover:underline"
              >
                Connexion
              </Link>
            ))}
        </header>

        {/* Identity strip, directly under the navbar. Absent when signed out. */}
        <div className="mt-3">
          <PlayerBar />
        </div>

        <section className="flex flex-1 flex-col justify-center py-10">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-volt-500">
            1 vs 1
          </p>
          <h1 className="mt-3 text-6xl font-black uppercase leading-[0.88] tracking-tighter sm:text-7xl">
            Défie
            <br />
            tes potes.
            <br />
            <span className="text-volt-500">Prouve-le.</span>
          </h1>
          <p className="mt-5 max-w-sm text-lg leading-snug text-ink-300">
            Un max de{' '}
            <strong className="text-ink-100">pompes en 60 secondes</strong>. Ta
            caméra compte les reps. Le meilleur gagne.
          </p>

          <TopWorld uid={user?.uid ?? null} />
        </section>

        <footer className="py-6 text-center text-xs text-ink-600">
          Détection 100 % locale — ta vidéo ne quitte jamais ton appareil.
        </footer>
      </main>

      <FloatingCta />
    </>
  );
}
