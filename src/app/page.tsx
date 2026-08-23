'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { useAuth } from '@/lib/firebase/auth-context';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { recentBattles } from '@/lib/firebase/battles';
import { getExercise } from '@/lib/exercise/registry';
import type { BattleWithId } from '@/lib/battle/types';

function RecentBattles() {
  const [battles, setBattles] = useState<BattleWithId[] | null>(null);

  useEffect(() => {
    let alive = true;
    void recentBattles(5).then((b) => {
      if (alive) setBattles(b);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!battles?.length) return null;

  return (
    <section className="mt-12">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-ink-400">
        Derniers battles
      </h2>
      <ul className="flex flex-col gap-2">
        {battles.map((b) => {
          const ex = getExercise(b.exercise);
          const draw = b.winner === 'draw';
          return (
            <li key={b.id}>
              <Card className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden className="text-lg">
                    {ex.emoji}
                  </span>
                  <span className="truncate text-sm text-ink-300">{ex.label}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2 tnum">
                  <span className="text-lg font-black text-volt-500">
                    {b.player1Score}
                  </span>
                  <span className="text-xs text-ink-600">—</span>
                  <span className="text-lg font-black text-flare-400">
                    {b.player2Score}
                  </span>
                  {draw && (
                    <span className="ml-1 text-xs font-bold text-ink-400">NUL</span>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function Home() {
  const { user, username, avatar, loading, signOut } = useAuth();

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
            <div className="flex items-center gap-2.5">
              {avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-7 rounded-full border border-ink-700 object-cover"
                />
              )}
              <button
                onClick={() => void signOut()}
                className="text-sm text-ink-400 transition-colors hover:text-ink-100"
              >
                Déconnexion
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

        {authed && username && (
          <p className="mt-6 text-sm text-ink-400">
            Prêt, <span className="font-semibold text-ink-100">{username}</span> ?
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <Link href={cta('/battle/create')} className="block">
            <Button size="xl" className="animate-pulse-ring">
              CRÉER UN BATTLE
            </Button>
          </Link>
          <Link href={cta('/battle/join')} className="block">
            <Button size="xl" variant="secondary">
              REJOINDRE UN BATTLE
            </Button>
          </Link>
        </div>

        <RecentBattles />
      </section>

      <footer className="py-6 text-center text-xs text-ink-600">
        Détection 100 % locale — ta vidéo ne quitte jamais ton appareil.
      </footer>
    </main>
  );
}
