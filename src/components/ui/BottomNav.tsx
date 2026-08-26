'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { useAuth } from '@/lib/firebase/auth-context';
import { ModeSheet } from './ModeSheet';

/**
 * The app's primary navigation, pinned in the thumb zone.
 *
 * Four tabs around a central action. It used to be three — Boutique, Battle,
 * Compte — with no Home and no Classement, which meant the only way back to
 * the hub was a small logo in the top-left corner, the furthest point from a
 * thumb on a phone. That was the single worst navigation flaw in the app.
 *
 * Mounted per-page rather than in the root layout on purpose: the layout is
 * shared with the battle screen, and a bar sitting over the camera mid-effort
 * would be genuinely in the way. Pages that should not offer it simply do not
 * render it — /battle, /matchmaking, /login and /admin all leave it out.
 *
 * Pair with `pb-32` on the page content so the last element is not hidden
 * underneath.
 */

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
      <path d="M7 4h10v5a5 5 0 0 1-10 0Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
      <path d="M12 14v3M9 20h6" />
    </svg>
  );
}

function ShopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
      <path d="M3 6h18l-1.5 12.5a2 2 0 0 1-2 1.5H6.5a2 2 0 0 1-2-1.5Z" />
      <path d="M8 6V4.5a4 4 0 0 1 8 0V6" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-6" aria-hidden>
      <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function Tab({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'focus-ring relative flex flex-1 flex-col items-center gap-1 rounded-xl py-2 transition-colors',
        active ? 'text-volt-500' : 'text-ink-400 hover:text-ink-200',
      )}
    >
      {children}
      <span className="text-3xs font-bold uppercase tracking-widest">{label}</span>
      {/* A dot rather than colour alone: colour is not an accessible signal on
          its own, and at this size the tint is easy to miss. */}
      {active && (
        <span
          aria-hidden
          className="absolute -top-0.5 size-1 rounded-full bg-volt-500"
        />
      )}
    </Link>
  );
}

export function BottomNav({ className }: { className?: string }) {
  const { user, needsUsernameFix } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sheet, setSheet] = useState(false);

  // A legacy pseudo is a genuine dead end: matchmaking bounces to /compte until
  // it is fixed, so offering the bar would only mislead.
  if (needsUsernameFix) return null;

  // Deliberately NOT gated on `loading`. Hiding the bar until Firebase answers
  // makes it flicker in on every page load. Signed out is a valid state — the
  // tabs point at /login instead of vanishing, so a visitor still sees what the
  // app offers.
  const to = (path: string) =>
    user ? path : `/login?next=${encodeURIComponent(path)}`;

  const openBattle = () => {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent('/matchmaking')}`);
      return;
    }
    setSheet(true);
  };

  return (
    <>
      <ModeSheet open={sheet} onClose={() => setSheet(false)} />

      <nav
        aria-label="Navigation principale"
        className={cn('fixed inset-x-0 bottom-0 z-40 flex justify-center px-4', className)}
        // Clear the iOS home indicator without eating space on other devices.
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Scrim so the bar stays legible over whatever scrolls beneath it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 top-[-2.5rem] bg-gradient-to-t from-ink-950 via-ink-950/85 to-transparent"
        />

        <div className="relative flex w-full max-w-lg items-end gap-1 rounded-2xl border border-ink-800 bg-ink-900/95 p-2 shadow-lg shadow-ink-950/60 backdrop-blur">
          <Tab href="/" label="Accueil" active={pathname === '/'}>
            <HomeIcon />
          </Tab>
          <Tab
            href={to('/classement')}
            label="Classement"
            active={pathname === '/classement'}
          >
            <TrophyIcon />
          </Tab>

          {/* The centre is an action, not a peer tab: it is the whole point of
              the app, so it keeps the weight of a button. It opens a picker
              rather than guessing an exercise on the player's behalf. */}
          <button
            type="button"
            onClick={openBattle}
            aria-haspopup="dialog"
            aria-expanded={sheet}
            className={cn(
              'focus-ring flex flex-[1.3] flex-col items-center gap-0.5 rounded-xl bg-volt-500 px-2 py-2.5',
              'font-black text-ink-950 transition-colors hover:bg-volt-400 active:bg-volt-600',
            )}
          >
            <BoltIcon />
            <span className="text-3xs uppercase tracking-widest">Battle</span>
          </button>

          <Tab
            href={to('/boutique')}
            label="Boutique"
            active={pathname === '/boutique'}
          >
            <ShopIcon />
          </Tab>
          <Tab href={to('/compte')} label="Compte" active={pathname === '/compte'}>
            <UserIcon />
          </Tab>
        </div>
      </nav>
    </>
  );
}
