'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { Spinner } from '@/components/ui/Spinner';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { useRequireAuth } from '@/lib/firebase/useRequireAuth';
import { createBattle } from '@/lib/firebase/battles';
import { DEFAULT_EXERCISE, getExercise } from '@/lib/exercise/registry';
import { DEFAULT_DURATION_SECS } from '@/lib/battle/constants';

export default function CreateBattlePage() {
  const { user, loading } = useRequireAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const exercise = getExercise(DEFAULT_EXERCISE);

  // Create as soon as we know who the user is. The ref guards against React's
  // double-invoked effects in development creating two battles.
  useEffect(() => {
    if (!user || startedRef.current) return;
    startedRef.current = true;

    void createBattle(user.uid, DEFAULT_EXERCISE, DEFAULT_DURATION_SECS)
      .then(({ id }) => router.replace(`/battle/${id}`))
      .catch(() => {
        setError("Impossible de créer le battle. Vérifie ta connexion.");
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
          <h1 className="text-2xl font-black uppercase tracking-tight">Oups</h1>
          <p className="text-ink-300">{error}</p>
          <Button onClick={() => router.refresh()}>Réessayer</Button>
          <Link href="/">
            <Button variant="ghost">Retour à l’accueil</Button>
          </Link>
        </div>
      ) : (
        <div className="text-center">
          <div className="mb-4 text-6xl" aria-hidden>
            {exercise.emoji}
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tighter">
            {exercise.label}
          </h1>
          <p className="mt-2 text-ink-400">{exercise.tagline}</p>
          <Spinner label={loading ? 'Connexion…' : 'Création du battle…'} />
        </div>
      )}
    </main>
  );
}
