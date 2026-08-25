'use client';

import { FloatingCta } from '@/components/ui/FloatingCta';
import { Logo } from '@/components/ui/Logo';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { Landing } from '@/components/landing/Landing';
import { TopWorld } from '@/components/leaderboard/TopWorld';
import { ModeGrid } from '@/components/play/ModeGrid';
import { PlayerBar } from '@/components/profile/PlayerBar';
import { useAuth } from '@/lib/firebase/auth-context';
import { isFirebaseConfigured } from '@/lib/firebase/client';

/**
 * One URL, two audiences.
 *
 * A visitor gets the pitch; a signed-in player gets straight to the game —
 * their card, the modes, and the leaderboard they are trying to climb. Both
 * render behind `/` rather than redirecting, so there is no flash and nothing
 * different to share.
 */
export default function Home() {
  const { user, loading, signOut } = useAuth();

  if (!isFirebaseConfigured) return <SetupNotice />;

  // While auth resolves, show the landing skeleton rather than the hub: a
  // visitor is the more common first paint, and flashing a player card that
  // then vanishes is worse than the reverse.
  if (!user) {
    return (
      <>
        <Landing />
        <FloatingCta label="COMMENCER" />
      </>
    );
  }

  return (
    <>
      {/* pb-28 keeps the floating CTA from covering the last card. */}
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 p-6 pb-28">
        <header className="flex items-center justify-between py-1">
          <Logo className="text-xl" />
          {!loading && (
            <button
              onClick={() => void signOut()}
              className="text-sm text-ink-400 transition-colors hover:text-ink-100"
            >
              Déconnexion
            </button>
          )}
        </header>

        <PlayerBar />

        <ModeGrid />

        <TopWorld uid={user.uid} />

        <footer className="mt-auto py-4 text-center text-xs text-ink-600">
          Détection 100 % locale — ta vidéo ne quitte jamais ton appareil.
        </footer>
      </main>

      <FloatingCta />
    </>
  );
}
