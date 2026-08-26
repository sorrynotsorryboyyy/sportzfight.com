'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';

/**
 * The error boundary.
 *
 * This app renders entirely on the client and leans on the camera, WASM and
 * browser permissions — so an uncaught throw is a real possibility, not a
 * theoretical one. Without this file the user gets Next.js's default screen,
 * in English, with a stack trace.
 *
 * `reset()` re-renders the failed segment: worth offering, because most of the
 * plausible failures here are transient (a camera busy in another tab, a model
 * that did not download).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <Logo className="text-2xl" />
      <div>
        <h1 className="text-2xl font-black uppercase tracking-tighter">
          Quelque chose a lâché
        </h1>
        <p className="mt-2 text-ink-400">
          Une erreur inattendue s’est produite. Réessayer suffit le plus souvent.
        </p>
        {/* The digest is what lets a report be matched to a server log. No
            stack trace: it would say nothing useful to a player. */}
        {error.digest && (
          <p className="mt-3 text-xs text-ink-600">
            Code de l’erreur : <span className="tnum">{error.digest}</span>
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <Button onClick={reset}>Réessayer</Button>
        <Link href="/">
          <Button variant="ghost">Retour à l’accueil</Button>
        </Link>
      </div>
    </main>
  );
}
