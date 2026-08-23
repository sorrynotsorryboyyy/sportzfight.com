'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { useRequireAuth } from '@/lib/firebase/useRequireAuth';
import { findOrCreateBattle } from '@/lib/firebase/matchmaking';
import { getExercise, DEFAULT_EXERCISE } from '@/lib/exercise/registry';

export default function MatchmakingPage() {
  const { user, loading } = useRequireAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Guards React StrictMode's double-invoked effects, which would otherwise
  // post two battles into the pool on every visit in development.
  const startedRef = useRef(false);

  const exercise = getExercise(DEFAULT_EXERCISE);

  useEffect(() => {
    if (!user || startedRef.current) return;
    startedRef.current = true;

    void findOrCreateBattle(user.uid)
      .then(({ id }) => router.replace(`/battle/${id}`))
      .catch(() => {
        setError('Impossible de trouver un adversaire. Vérifie ta connexion.');
        startedRef.current = false;
      });
  }, [user, router]);

  if (!isFirebaseConfigured) return <SetupNotice />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 p-6">
      <Link href="/" className="self-start">
        <Logo className="text-2xl" />
      </Link>

      {error ? (
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Oups</h1>
          <p className="text-ink-300">{error}</p>
          <Button onClick={() => router.refresh()}>Réessayer</Button>
          <Link href="/">
            <Button variant="ghost">Retour à l’accueil</Button>
          </Link>
        </div>
      ) : (
        <div className="text-center">
          <div className="relative mx-auto mb-8 grid size-32 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-volt-500/20" />
            <span className="absolute inset-4 animate-pulse rounded-full bg-volt-500/15" />
            <span className="relative text-6xl" aria-hidden>
              {exercise.emoji}
            </span>
          </div>

          <h1 className="text-3xl font-black uppercase tracking-tighter">
            Recherche d’un adversaire
          </h1>
          <p className="mt-3 text-ink-400">
            {loading ? 'Connexion…' : exercise.tagline}
          </p>

          <div
            className="mt-8 flex items-center justify-center gap-2 text-sm text-ink-500"
            role="status"
            aria-live="polite"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-volt-500" />
            Mise en relation…
          </div>

          <Link href="/" className="mt-10 block">
            <Button variant="ghost">Annuler</Button>
          </Link>
        </div>
      )}
    </main>
  );
}
