'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { TopWorld } from '@/components/leaderboard/TopWorld';
import { LandingNav } from './LandingNav';
import { PhoneMockup } from './PhoneMockup';

/**
 * What a visitor sees before signing in.
 *
 * The pitch lives here rather than on the play hub: a returning player should
 * not have to scroll past marketing to reach the leaderboard and the search
 * button. Same URL, two audiences.
 *
 * Laid out mobile-first but NOT mobile-only. The rest of the app is a phone
 * column on purpose — you use it while exercising — but a landing page seen on
 * a 1440px screen has to fill it, or it reads as unfinished.
 */

const STEPS = [
  {
    n: '1',
    title: 'Pose ton téléphone',
    body: 'Au sol, de côté. Pas de tapis, pas d’abonnement en salle, pas de tenue.',
  },
  {
    n: '2',
    title: 'Une minute, pas plus',
    body: 'Un adversaire trouvé en un clic, un décompte synchronisé, et c’est parti.',
  },
  {
    n: '3',
    title: 'La caméra fait le reste',
    body: 'Chaque répétition comptée automatiquement. Tu n’as qu’à te donner à fond.',
  },
] as const;

/** Consistent horizontal rhythm for every section. */
const SHELL = 'mx-auto w-full max-w-6xl px-5 sm:px-8';

export function Landing() {
  return (
    <div className="min-h-dvh">
      <LandingNav />

      {/* ---------------- hero ---------------- */}
      <section className="relative overflow-hidden">
        {/* Ambient light, so the fold is not a flat black rectangle. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-volt-500/8 blur-3xl"
        />

        <div
          className={`${SHELL} relative grid items-center gap-12 py-16 lg:grid-cols-2 lg:gap-16 lg:py-24`}
        >
          <div className="animate-rise">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-volt-500">
              60 secondes chrono
            </p>
            <h1 className="mt-4 text-5xl font-black uppercase leading-[0.88] tracking-tighter sm:text-6xl lg:text-7xl">
              Le sport
              <br />
              <span className="text-volt-500">sans excuse.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-snug text-ink-300 lg:text-xl">
              Une minute, ton téléphone, aucun matériel. Ta caméra compte les
              répétitions pendant que tu affrontes quelqu’un en direct.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/login" className="sm:w-auto">
                <Button size="xl" className="sm:px-10">
                  COMMENCER
                </Button>
              </Link>
              <a
                href="#comment"
                className="text-center text-sm font-semibold text-ink-400 transition-colors hover:text-ink-100 sm:text-left"
              >
                Voir comment ça marche
              </a>
            </div>

            <p className="mt-4 text-sm text-ink-500">
              Connexion Google · aucun mot de passe · gratuit
            </p>
          </div>

          <PhoneMockup className="lg:max-w-[18rem]" />
        </div>
      </section>

      {/* ---------------- comment ça marche ---------------- */}
      <section id="comment" className="scroll-mt-20 border-t border-ink-800/60 py-16 lg:py-24">
        <div className={SHELL}>
          <h2 className="text-3xl font-black uppercase tracking-tighter sm:text-4xl">
            Aucune raison de <span className="text-volt-500">remettre à demain</span>
          </h2>
          <p className="mt-3 max-w-lg text-ink-400">
            Le temps de lire cette page, tu aurais déjà fini ta séance.
          </p>

          <ol className="mt-10 grid gap-4 md:grid-cols-3 md:gap-6">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="panel-sheen rounded-2xl border border-ink-800 bg-ink-900/70 p-6"
              >
                <span className="grid size-10 place-items-center rounded-full bg-volt-500/15 text-base font-black text-volt-500">
                  {s.n}
                </span>
                <h3 className="mt-4 text-lg font-bold leading-tight text-ink-100">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-400">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- preuve sociale ---------------- */}
      <section
        id="classement"
        className="scroll-mt-20 border-t border-ink-800/60 py-16 lg:py-24"
      >
        <div className={SHELL}>
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-black uppercase tracking-tighter sm:text-4xl">
                Ils sont déjà <span className="text-gold">au sommet</span>
              </h2>
              <p className="mt-3 max-w-lg text-ink-400">
                Classement mondial, mis à jour à chaque battle.
              </p>
            </div>
          </div>

          {/* Real players beat any promise; TopWorld already has a showcase
              mode that hides the personal row. */}
          <div className="mx-auto max-w-2xl">
            <TopWorld uid={null} showSelf={false} />
          </div>
        </div>
      </section>

      {/* ---------------- confiance ---------------- */}
      <section className="border-t border-ink-800/60 py-16 lg:py-24">
        <div className={SHELL}>
          <div className="relative overflow-hidden rounded-3xl border border-cyan-glow/25 bg-cyan-glow/5 p-8 lg:p-12">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-cyan-glow/10 blur-3xl"
            />
            <div className="relative max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-glow">
                Vie privée
              </p>
              <h2 className="mt-3 text-2xl font-black uppercase tracking-tight text-ink-100 sm:text-3xl">
                Ta vidéo ne quitte jamais ton appareil
              </h2>
              <p className="mt-4 text-base leading-relaxed text-ink-300">
                La détection tourne entièrement dans ton navigateur. Rien n’est
                filmé, rien n’est envoyé, rien n’est stocké : seul le nombre de
                pompes est enregistré.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- CTA final ---------------- */}
      <section className="border-t border-ink-800/60 py-16 text-center lg:py-24">
        <div className={SHELL}>
          <h2 className="text-4xl font-black uppercase leading-none tracking-tighter sm:text-5xl">
            Ta séance commence <span className="text-volt-500">maintenant</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-ink-400">
            Soixante secondes. Tu les as.
          </p>
          <Link href="/login" className="mt-8 inline-block w-full sm:w-auto">
            <Button size="xl" className="sm:px-12">
              COMMENCER
            </Button>
          </Link>
        </div>
      </section>

      {/* ---------------- pied de page ---------------- */}
      <footer className="border-t border-ink-800/60 py-10">
        <div
          className={`${SHELL} flex flex-col items-center justify-between gap-4 text-sm sm:flex-row`}
        >
          <p className="text-ink-600">
            SportzFight — défis sportifs en 1 vs 1
          </p>
          <div className="flex items-center gap-6">
            <a
              href="#comment"
              className="text-ink-500 transition-colors hover:text-ink-300"
            >
              Comment ça marche
            </a>
            <Link
              href="/classement"
              className="text-ink-500 transition-colors hover:text-ink-300"
            >
              Classement
            </Link>
            <Link
              href="/boutique"
              className="text-ink-500 transition-colors hover:text-ink-300"
            >
              Boutique
            </Link>
            <Link
              href="/login"
              className="font-semibold text-volt-500 hover:underline"
            >
              Connexion
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
