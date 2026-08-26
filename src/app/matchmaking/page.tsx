'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { useRequireAuth } from '@/lib/firebase/useRequireAuth';
import { useAuth } from '@/lib/firebase/auth-context';
import { findOrCreateBattle } from '@/lib/firebase/matchmaking';
import { getExercise, DEFAULT_EXERCISE } from '@/lib/exercise/registry';

function Matchmaking() {
  const { user, loading } = useRequireAuth();
  const { needsUsernameFix, needsOnboarding, profile } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  // Guards React StrictMode's double-invoked effects, which would otherwise
  // post two battles into the pool on every visit in development.
  const startedRef = useRef(false);

  // The mode comes from the hub's grid. getExercise() falls back to pushups on
  // an unknown id, and an unreleased exercise is refused outright — otherwise a
  // hand-typed ?exercise= would drop the player into a queue nobody can join,
  // because scanCandidates filters on this exact value.
  const requested = params.get('exercise');
  const picked = getExercise(requested ?? DEFAULT_EXERCISE);
  const exercise = picked.available ? picked : getExercise(DEFAULT_EXERCISE);

  useEffect(() => {
    if (!user || startedRef.current) return;
    // A legacy pseudo must be replaced first: it is about to appear on a public
    // leaderboard, and the uniqueness lock does not exist for it yet.
    if (needsUsernameFix) {
      router.replace('/compte');
      return;
    }
    // The welcome screen has to be finished before a first battle, for the
    // same reason: the name is about to be public.
    if (needsOnboarding) {
      router.replace('/bienvenue');
      return;
    }
    // Wait for the profile before deciding — otherwise the check races the
    // subscription and sends compliant users to /compte for a frame.
    if (!profile) return;

    startedRef.current = true;

    void findOrCreateBattle(user.uid, exercise.id)
      .then(({ id }) => router.replace(`/battle/${id}`))
      .catch(() => {
        setError('Impossible de trouver un adversaire. Vérifie ta connexion.');
        startedRef.current = false;
      });
  }, [user, router, needsUsernameFix, needsOnboarding, profile, exercise.id]);

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

/**
 * useSearchParams needs a Suspense boundary in the app router, so the page
 * itself is a thin shell around the real component.
 */
export default function MatchmakingPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center p-6">
          <span className="size-8 animate-spin rounded-full border-2 border-ink-700 border-t-volt-500" />
        </main>
      }
    >
      <Matchmaking />
    </Suspense>
  );
}
