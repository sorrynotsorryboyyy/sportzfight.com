import { Card } from './Card';
import { Logo } from './Logo';

/**
 * Shown when the deployment has no Firebase credentials, instead of letting
 * the SDK throw something opaque. A fresh clone should explain itself.
 */
export function SetupNotice() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-6">
      <Logo className="text-3xl" />
      <Card>
        <h1 className="text-xl font-bold">Configuration requise</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-300">
          Firebase n’est pas configuré. Copie <code className="rounded bg-ink-800 px-1.5 py-0.5 text-volt-400">.env.local.example</code>{' '}
          vers <code className="rounded bg-ink-800 px-1.5 py-0.5 text-volt-400">.env.local</code>, renseigne les
          clés de ton projet Firebase, puis relance le serveur.
        </p>
        <ol className="mt-4 space-y-2 text-sm text-ink-400">
          <li>1. Crée un projet sur console.firebase.google.com</li>
          <li>2. Active Authentication (Google) et Firestore</li>
          <li>3. Copie la config Web dans .env.local</li>
          <li>
            4. Déploie les règles :{' '}
            <code className="rounded bg-ink-800 px-1.5 py-0.5 text-volt-400">
              firebase deploy --only firestore
            </code>
          </li>
        </ol>
      </Card>
    </main>
  );
}
