'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/firebase/auth-context';

/**
 * The persistent "find a battle" action, pinned in the thumb zone.
 *
 * Mounted per-page rather than in the root layout on purpose: the layout is
 * shared with the battle screen, and a floating button sitting over the camera
 * mid-effort would be genuinely in the way. Pages that should not offer it
 * simply do not render it.
 *
 * Pair with `pb-28` (or more) on the page content so the last element is not
 * hidden underneath.
 */
export function FloatingCta({
  label = 'RECHERCHER UN BATTLE',
}: {
  label?: string;
}) {
  const { user, needsUsernameFix } = useAuth();

  // Deliberately NOT gated on `loading`. This is the primary action of the
  // whole app; hiding it until Firebase Auth answers makes it flicker in on
  // every page load, and vanish entirely if auth is slow or offline. Signed
  // out is a valid state — the button just points at /login instead.
  //
  // A legacy pseudo is the one real dead end: matchmaking bounces to /compte
  // until it is fixed, so offering the button there would mislead.
  if (needsUsernameFix) return null;

  const href = user ? '/matchmaking' : '/login?next=%2Fmatchmaking';

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pt-10"
      // Clear the iOS home indicator without eating space on other devices.
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Scrim so the button stays legible over whatever scrolls beneath it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/85 to-transparent"
      />
      <Link href={href} className="pointer-events-auto relative w-full max-w-lg">
        <Button size="xl" className="shadow-lg shadow-ink-950/60">
          {label}
        </Button>
      </Link>
    </div>
  );
}
