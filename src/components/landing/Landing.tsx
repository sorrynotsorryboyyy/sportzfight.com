'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { LandingNav } from './LandingNav';
import { PhoneMockup } from './PhoneMockup';
import { StoreBadges } from './StoreBadges';

/**
 * What a visitor sees before signing in: one screen, no scrolling.
 *
 * The page used to run six sections deep — steps, leaderboard, privacy, a
 * second CTA, a footer. It is now a single fold. Everything that mattered is
 * still reachable: the leaderboard and the shop from the nav, the pitch in
 * three lines instead of three cards.
 *
 * The no-scroll promise is the constraint that shapes the rest of this file.
 * The hero is sized to the viewport minus the chrome around it, and the phone
 * mockup steps aside on narrow screens rather than pushing content off the
 * bottom.
 */

/** Height reserved for the mobile bottom bar: tabs + padding + home indicator. */
const BOTTOM_BAR = 'calc(5.5rem + env(safe-area-inset-bottom, 0px))';

export function Landing() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <LandingNav />

      <section className="relative flex flex-1 items-center overflow-hidden">
        {/* Ambient light, so the fold is not a flat black rectangle. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-volt-500/8 blur-3xl"
        />

        <div
          className="relative mx-auto grid w-full max-w-6xl items-center gap-8 px-5 pb-[var(--bottom-bar)] sm:px-8 lg:grid-cols-2 lg:gap-16 lg:pb-0"
          style={{ '--bottom-bar': BOTTOM_BAR } as React.CSSProperties}
        >
          <div className="animate-rise">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-volt-500 sm:text-sm">
              60 secondes chrono
            </p>

            {/* Steps down hard on short screens: this headline is the first
                thing to overflow a 640px-tall laptop window. */}
            <h1 className="mt-3 text-4xl font-black uppercase leading-[0.88] tracking-tighter sm:text-5xl lg:text-6xl xl:text-7xl">
              Le sport
              <br />
              <span className="text-volt-500">sans excuse.</span>
            </h1>

            <p className="mt-4 max-w-md text-base leading-snug text-ink-300 sm:text-lg lg:mt-6 lg:text-xl">
              Une minute, ton téléphone, aucun matériel. Ta caméra compte les
              répétitions pendant que tu affrontes quelqu’un en direct.
            </p>

            <div className="mt-6 lg:mt-8">
              <Link href="/login" className="inline-block w-full sm:w-auto">
                <Button size="lg" className="sm:px-10 lg:h-16 lg:text-xl">
                  Commencer sur navigateur
                </Button>
              </Link>
              <p className="mt-2.5 text-xs text-ink-500 sm:text-sm">
                Connexion Google · aucun mot de passe · gratuit
              </p>
            </div>

            <StoreBadges className="mt-6 lg:mt-8" />
          </div>

          {/* Hidden below lg: on a phone this is what would force a scroll,
              and the visitor is already holding the device it depicts. */}
          <PhoneMockup className="hidden lg:block lg:max-w-[17rem]" />
        </div>
      </section>
    </div>
  );
}
