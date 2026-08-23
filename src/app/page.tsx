'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { Podium, RankRow } from '@/components/leaderboard/Podium';
import { LevelRing } from '@/components/profile/LevelRing';
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

  // Nothing to celebrate yet: stay quiet rather than show an empty podium.
  if (!players?.length) return null;

  const onPodium = players.slice(0, 3).find((p) => p.uid === uid);

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
              rank:
                players.find((p) => p.uid === uid)?.rank ?? myRank ?? 0,
            }}
          />
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const { user, username, avatar, profile, loading, signOut } = useAuth();

  if (!isFirebaseConfigured) return <SetupNotice />;

  const authed = !!user;
  const cta = (path: string) =>
    authed ? path : `/login?next=${encodeURIComponent(path)}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col p-6">
      <header className="flex items-center justify-between py-2">
        <Logo className="text-xl" />
        {!loading &&
          (authed ? (
            <div className="flex items-center gap-3">
              <Link
                href="/compte"
                className="flex items-center gap-2 rounded-full border border-ink-800 py-1 pl-1 pr-3 transition-colors hover:border-ink-600"
              >
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="size-7 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid size-7 place-items-center rounded-full bg-ink-800 text-xs font-bold text-ink-400">
                    {(username ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="max-w-[7rem] truncate text-sm font-semibold text-ink-200">
                  {username}
                </span>
              </Link>
              <button
                onClick={() => void signOut()}
                className="text-sm text-ink-400 transition-colors hover:text-ink-100"
              >
                Quitter
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="text-sm font-semibold text-volt-500 hover:underline"
            >
              Connexion
            </Link>
          ))}
      </header>

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
          Un max de <strong className="text-ink-100">pompes en 60 secondes</strong>.
          Ta caméra compte les reps. Le meilleur gagne.
        </p>

        {authed && profile && (
          <Link href="/compte" className="mt-6 block">
            <Card className="flex items-center gap-3 py-3">
              <LevelRing xp={profile.xp ?? 0} size={52} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink-100">
                  {profile.username}
                </p>
                <p className="tnum text-xs text-ink-500">
                  {profile.wins ?? 0} V · {profile.losses ?? 0} D ·{' '}
                  <span className="text-gold">{profile.coins ?? 0} $SC</span>
                </p>
              </div>
              <span className="shrink-0 text-xs text-ink-600">→</span>
            </Card>
          </Link>
        )}

        <div className="mt-8">
          <Link href={cta('/matchmaking')} className="block">
            <Button size="xl" className="animate-pulse-ring">
              RECHERCHER UN BATTLE
            </Button>
          </Link>
          <p className="mt-3 text-center text-sm text-ink-500">
            On te trouve un adversaire au hasard.
          </p>
        </div>

        <TopWorld uid={user?.uid ?? null} />
      </section>

      <footer className="py-6 text-center text-xs text-ink-600">
        Détection 100 % locale — ta vidéo ne quitte jamais ton appareil.
      </footer>
    </main>
  );
}
