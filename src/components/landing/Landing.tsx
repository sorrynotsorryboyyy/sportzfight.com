'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { TopWorld } from '@/components/leaderboard/TopWorld';

/**
 * What a visitor sees before signing in.
 *
 * The pitch lives here rather than on the play hub: a returning player should
 * not have to scroll past marketing to reach the leaderboard and the search
 * button. Same URL, two audiences.
 */

const STEPS = [
  {
    n: '1',
    title: 'Trouve un adversaire',
    body: 'Un clic, et on te met face à quelqu’un au hasard.',
  },
  {
    n: '2',
    title: '60 secondes de pompes',
    body: 'Décompte synchronisé, vous démarrez exactement en même temps.',
  },
  {
    n: '3',
    title: 'La caméra compte',
    body: 'Chaque répétition validée automatiquement. Le meilleur gagne.',
  },
] as const;

export function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col p-6 pb-28">
      <header className="flex items-center justify-between py-2">
        <Logo className="text-xl" />
        <Link
          href="/login"
          className="text-sm font-semibold text-volt-500 hover:underline"
        >
          Connexion
        </Link>
      </header>

      {/* --- accroche --- */}
      <section className="py-10">
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

        <Link href="/login" className="mt-8 block">
          <Button size="xl" className="animate-pulse-ring">
            COMMENCER
          </Button>
        </Link>
        <p className="mt-3 text-center text-sm text-ink-500">
          Connexion Google, aucun mot de passe à retenir.
        </p>
      </section>

      {/* --- comment ça marche --- */}
      <section className="py-6">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-ink-400">
          Comment ça marche
        </h2>
        <ol className="flex flex-col gap-3">
          {STEPS.map((s) => (
            <li key={s.n}>
              <Card className="flex items-start gap-3.5 py-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-volt-500/15 text-sm font-black text-volt-500">
                  {s.n}
                </span>
                <div className="min-w-0">
                  <p className="font-bold leading-tight text-ink-100">
                    {s.title}
                  </p>
                  <p className="mt-1 text-sm leading-snug text-ink-400">
                    {s.body}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* --- preuve sociale : de vrais joueurs, pas une promesse --- */}
      <section className="py-6">
        <TopWorld uid={null} showSelf={false} />
      </section>

      {/* --- l'argument confiance, remonté du pied de page --- */}
      <section className="py-6">
        <Card className="border-cyan-glow/25 bg-cyan-glow/5">
          <p className="text-sm font-bold text-cyan-glow">
            Ta vidéo ne quitte jamais ton appareil
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-300">
            La détection tourne entièrement dans ton navigateur. Rien n’est
            filmé, rien n’est envoyé : seul le nombre de pompes est enregistré.
          </p>
        </Card>
      </section>

      <footer className="py-8 text-center text-xs text-ink-600">
        SportzFight — défis sportifs en 1 vs 1
      </footer>
    </main>
  );
}
