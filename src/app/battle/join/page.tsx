'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { Spinner } from '@/components/ui/Spinner';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { useRequireAuth } from '@/lib/firebase/useRequireAuth';
import { BattleError, joinBattle } from '@/lib/firebase/battles';
import { CODE_LENGTH, isValidCode, normalizeCode } from '@/lib/utils/code';

function JoinForm() {
  const { user, loading } = useRequireAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [code, setCode] = useState(() => normalizeCode(params.get('code') ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = isValidCode(code);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !ready) return;

    setBusy(true);
    setError(null);
    try {
      const id = await joinBattle(user.uid, code);
      router.replace(`/battle/${id}`);
    } catch (err) {
      setError(
        err instanceof BattleError
          ? err.message
          : 'Impossible de rejoindre. Vérifie ta connexion.',
      );
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Connexion…" />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 p-6">
      <Link href="/" className="self-start">
        <Logo className="text-2xl" />
      </Link>

      <div>
        <h1 className="text-4xl font-black uppercase tracking-tighter">
          Rejoindre
        </h1>
        <p className="mt-2 text-ink-400">Saisis le code que ton adversaire t’a envoyé.</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <label
            htmlFor="code"
            className="mb-2 block text-xs font-semibold uppercase tracking-widest text-ink-400"
          >
            Code du battle
          </label>
          <input
            id="code"
            name="code"
            value={code}
            onChange={(e) => {
              setCode(normalizeCode(e.target.value));
              setError(null);
            }}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            maxLength={CODE_LENGTH}
            placeholder="ABC346"
            aria-invalid={!!error}
            className="tnum h-20 w-full rounded-2xl border-2 border-ink-700 bg-ink-850 text-center text-4xl font-black uppercase tracking-[0.3em] text-ink-100 placeholder:text-ink-700 focus:border-volt-500 focus:outline-none"
          />
          {error && <p className="mt-2 text-sm text-flare-400">{error}</p>}
        </div>

        <Button type="submit" size="xl" disabled={!ready} loading={busy}>
          REJOINDRE
        </Button>
      </form>

      <p className="text-center text-sm text-ink-400">
        Pas de code ?{' '}
        <Link href="/battle/create" className="font-semibold text-volt-500 hover:underline">
          Crée ton propre battle
        </Link>
      </p>
    </main>
  );
}

export default function JoinPage() {
  if (!isFirebaseConfigured) return <SetupNotice />;
  return (
    <Suspense fallback={<Spinner />}>
      <JoinForm />
    </Suspense>
  );
}
