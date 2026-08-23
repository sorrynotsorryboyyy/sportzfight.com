'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';
import { GoogleButton } from './GoogleButton';
import { useAuth } from '@/lib/firebase/auth-context';

/** Firebase auth codes are not user-facing; translate the ones people hit. */
function friendlyError(e: unknown): string | null {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    // The user closed the Google chooser. Not an error worth shouting about.
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null;
    case 'auth/account-exists-with-different-credential':
      return 'Un compte existe déjà avec cette adresse.';
    case 'auth/network-request-failed':
      return 'Connexion impossible. Vérifie ton réseau.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Réessaie dans quelques minutes.';
    case 'auth/operation-not-allowed':
      return "La connexion Google n'est pas activée dans Firebase.";
    case 'auth/unauthorized-domain':
      return "Ce domaine n'est pas autorisé dans Firebase Authentication.";
    default:
      return 'Une erreur est survenue. Réessaie.';
  }
}

export function AuthForm() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Once signed in (including after a redirect round trip), go where the user
  // was originally headed.
  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [user, loading, next, router]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      // On the popup path onAuthStateChanged fires and the effect redirects.
      // On the redirect path the page navigates away before we get here.
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-10 p-6">
      <Link href="/" className="self-start">
        <Logo className="text-2xl" />
      </Link>

      <div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-volt-500">
          1 vs 1
        </p>
        <h1 className="mt-3 text-5xl font-black uppercase leading-[0.9] tracking-tighter">
          Entre dans
          <br />
          l’arène.
        </h1>
        <p className="mt-4 text-lg leading-snug text-ink-300">
          Connecte-toi pour créer un battle et défier tes potes.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <GoogleButton onClick={() => void connect()} loading={busy || loading} />
        {error && (
          <p className="text-center text-sm text-flare-400" role="alert">
            {error}
          </p>
        )}
      </div>

      <p className="text-center text-xs leading-relaxed text-ink-600">
        Pas de mot de passe à retenir. On utilise seulement ton nom et ta photo
        Google pour t’identifier pendant les battles.
      </p>
    </main>
  );
}
