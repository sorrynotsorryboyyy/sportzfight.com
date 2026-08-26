'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useAuth } from '@/lib/firebase/auth-context';

/**
 * The app's primary navigation, pinned in the thumb zone.
 *
 * Mounted per-page rather than in the root layout on purpose: the layout is
 * shared with the battle screen, and a bar sitting over the camera mid-effort
 * would be genuinely in the way. Pages that should not offer it simply do not
 * render it — /battle, /matchmaking, /login and /admin all leave it out.
 *
 * Pair with `pb-32` on the page content so the last element is not hidden
 * underneath.
 */

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

function SideTab({
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
        'flex flex-1 flex-col items-center gap-1 rounded-xl py-2 transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-glow',
        active ? 'text-volt-500' : 'text-ink-400 hover:text-ink-200',
      )}
    >
      {children}
      <span className="text-[0.6rem] font-bold uppercase tracking-widest">
        {label}
      </span>
    </Link>
  );
}

export function BottomNav({ className }: { className?: string }) {
  const { user, needsUsernameFix } = useAuth();
  const pathname = usePathname();

  // A legacy pseudo is a genuine dead end: matchmaking bounces to /compte until
  // it is fixed, so offering the bar would only mislead.
  if (needsUsernameFix) return null;

  // Deliberately NOT gated on `loading`. Hiding the bar until Firebase answers
  // makes it flicker in on every page load. Signed out is a valid state — the
  // tabs point at /login instead of vanishing, so a visitor still sees what the
  // app offers.
  const to = (path: string) =>
    user ? path : `/login?next=${encodeURIComponent(path)}`;

  return (
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

      <div className="relative flex w-full max-w-lg items-end gap-2 rounded-2xl border border-ink-800 bg-ink-900/95 p-2 shadow-lg shadow-ink-950/60 backdrop-blur">
        <SideTab href={to('/boutique')} label="Boutique" active={pathname === '/boutique'}>
          <ShopIcon />
        </SideTab>

        {/* The centre is an action, not a peer tab: it is the whole point of
            the app, so it keeps the weight of a button. */}
        <Link
          href={to('/matchmaking')}
          className={cn(
            'flex flex-[1.4] flex-col items-center gap-0.5 rounded-xl bg-volt-500 px-2 py-2.5',
            'font-black text-ink-950 transition-colors hover:bg-volt-400 active:bg-volt-600',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-glow',
          )}
        >
          <BoltIcon />
          <span className="text-[0.6rem] uppercase tracking-widest">Battle</span>
        </Link>

        <SideTab href={to('/compte')} label="Compte" active={pathname === '/compte'}>
          <UserIcon />
        </SideTab>
      </div>
    </nav>
  );
}
