'use client';

import { BottomNav } from '@/components/ui/BottomNav';
import { PageHeader } from '@/components/ui/PageHeader';
import { SignOutButton } from '@/components/profile/SignOutButton';
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
  const { user, loading } = useAuth();

  if (!isFirebaseConfigured) return <SetupNotice />;

  // While auth resolves, show the landing skeleton rather than the hub: a
  // visitor is the more common first paint, and flashing a player card that
  // then vanishes is worse than the reverse.
  if (!user) {
    // No BottomNav here: its tabs lead to Boutique and Classement, which mean
    // nothing before signing in, and every one of them would bounce off to
    // /login anyway. The landing keeps a single call to action.
    return <Landing />;
  }

  return (
    <>
      {/* gap-5 p-5 pb-32 — the shared page geometry. This screen was the only
          one at gap-6 p-6, so the left edge visibly shifted when switching
          tabs. pb-32 keeps the bottom nav off the last card. */}
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 p-5 pb-32">
        <PageHeader action={!loading ? <SignOutButton /> : undefined} />

        <PlayerBar />

        <ModeGrid />

        <TopWorld uid={user.uid} />

        <footer className="mt-auto pt-2 text-center text-2xs text-ink-600">
          Détection 100 % locale — ta vidéo ne quitte jamais ton appareil.
        </footer>
      </main>

      <BottomNav />
    </>
  );
}
